/**
 * Colour sampling that runs in the browser.
 *
 * Studio ships to Cloudflare Workers, where there is no canvas and no
 * native image decoder, so the pixels are read on the client and only
 * the resulting hex list travels to the server. The bot keeps its own
 * server-side extractor in `src/services/colors` for the same reason:
 * the two runtimes cannot share one implementation.
 */

export type SampledColor = {
    hex: string;
    /**
     * Share of the sampled pixels that fell into this bucket.
     */
    population: number;
};

const MAX_SAMPLE_EDGE = 220;

/**
 * Per-channel resolution of the colour histogram. Four bits per
 * channel gives 4096 buckets, which is coarse enough that a photo's
 * compression noise collapses into a handful of buckets and fine
 * enough that distinct design colours stay separate.
 */
const HISTOGRAM_BITS = 4;
const HISTOGRAM_SHIFT = 8 - HISTOGRAM_BITS;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

export function toHex(r: number, g: number, b: number) {
    return (
        "#" +
        [r, g, b]
            .map((channel) =>
                clamp(Math.round(channel), 0, 255)
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("")
            .toUpperCase()
    );
}

export function isValidHex(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^#[0-9A-Fa-f]{6}$/.test(value)
    );
}

export function toRgb(hex: string) {
    const value = hex.replace("#", "");

    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

export function relativeLuminance(hex: string) {
    const { r, g, b } = toRgb(hex);

    const channels = [r, g, b].map((channel) => {
        const normalized = channel / 255;

        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });

    return (
        0.2126 * channels[0] +
        0.7152 * channels[1] +
        0.0722 * channels[2]
    );
}

export function contrastRatio(a: string, b: string) {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);

    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);

    return (lighter + 0.05) / (darker + 0.05);
}

export function saturation(hex: string) {
    const { r, g, b } = toRgb(hex);

    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;

    if (max === min) {
        return 0;
    }

    const lightness = (max + min) / 2;

    return (
        (max - min) /
        (lightness > 0.5 ? 2 - max - min : max + min)
    );
}

export function lightness(hex: string) {
    const { r, g, b } = toRgb(hex);

    return (
        (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255
    );
}

/**
 * How much colour a swatch carries, independent of how light it is.
 *
 * HSL saturation is the wrong measure for "vivid": it pushes a cream or
 * a lavender-white close to 1 because the denominator collapses as the
 * lightness approaches the extremes. Chroma stays near zero for those
 * tints while still hitting 1 for a pure hue, which is what the
 * intensity label is actually describing.
 */
export function chroma(hex: string) {
    const { r, g, b } = toRgb(hex);

    return (
        (Math.max(r, g, b) - Math.min(r, g, b)) / 255
    );
}

type HistogramBucket = {
    count: number;
    red: number;
    green: number;
    blue: number;
};

/**
 * Counts how often each colour appears, at histogram resolution.
 *
 * Median cut is the usual choice here, but it averages the pixels it
 * groups, so a flat image of a violet stripe next to an off-white one
 * reports a lavender that exists nowhere in the picture. That is a bad
 * trade for this tool: the swatches are shown as "the exact pixels
 * your image contains", and the palette is what the model judges.
 *
 * A histogram keeps every returned colour anchored to pixels that are
 * really there, and gives an honest population for each one.
 */
function buildHistogram(
    data: Uint8ClampedArray
): HistogramBucket[] {
    const buckets = new Map<number, HistogramBucket>();

    for (let i = 0; i < data.length; i += 4) {
        // Transparent pixels carry no aesthetic information.
        if (data[i + 3] < 128) {
            continue;
        }

        const red = data[i];
        const green = data[i + 1];
        const blue = data[i + 2];

        const key =
            ((red >> HISTOGRAM_SHIFT) <<
                (HISTOGRAM_BITS * 2)) |
            ((green >> HISTOGRAM_SHIFT) <<
                HISTOGRAM_BITS) |
            (blue >> HISTOGRAM_SHIFT);

        const bucket = buckets.get(key);

        if (bucket) {
            bucket.count += 1;
            bucket.red += red;
            bucket.green += green;
            bucket.blue += blue;
        } else {
            buckets.set(key, {
                count: 1,
                red,
                green,
                blue,
            });
        }
    }

    return [...buckets.values()].sort(
        (a, b) => b.count - a.count
    );
}

function bucketColor(
    bucket: HistogramBucket
): SampledColor {
    return {
        hex: toHex(
            bucket.red / bucket.count,
            bucket.green / bucket.count,
            bucket.blue / bucket.count
        ),
        population: bucket.count,
    };
}

/**
 * Collapses buckets that describe the same colour - a photo's
 * compression noise spreads one visual colour across many buckets -
 * keeping the more common colour and folding the loser's population
 * into it so the percentages still add up.
 */
function mergeSimilar(
    colors: SampledColor[],
    threshold = 24
): SampledColor[] {
    const kept: SampledColor[] = [];

    for (const color of colors) {
        const { r, g, b } = toRgb(color.hex);

        const existing = kept.find((candidate) => {
            const other = toRgb(candidate.hex);

            return (
                Math.abs(other.r - r) +
                    Math.abs(other.g - g) +
                    Math.abs(other.b - b) <
                threshold
            );
        });

        if (existing) {
            existing.population += color.population;
            continue;
        }

        kept.push({ ...color });
    }

    return kept.sort(
        (a, b) => b.population - a.population
    );
}

/**
 * Picks the most common colours, spreading the remainder across the
 * rest of the palette.
 *
 * Taking the top N buckets alone would report five shades of a
 * background and miss the accent colour entirely, so the most common
 * colour is kept and the rest are chosen greedily by "population
 * times distance from everything already chosen".
 */
function pickPalette(
    colors: SampledColor[],
    count: number
): SampledColor[] {
    if (colors.length <= count) {
        return colors;
    }

    const chosen = [colors[0]];
    const remaining = colors.slice(1);

    while (
        chosen.length < count &&
        remaining.length > 0
    ) {
        let bestIndex = 0;
        let bestScore = -1;

        for (let i = 0; i < remaining.length; i += 1) {
            const { r, g, b } = toRgb(
                remaining[i].hex
            );

            let closest = Number.POSITIVE_INFINITY;

            for (const existing of chosen) {
                const other = toRgb(existing.hex);

                closest = Math.min(
                    closest,
                    Math.abs(other.r - r) +
                        Math.abs(other.g - g) +
                        Math.abs(other.b - b)
                );
            }

            const score =
                remaining[i].population *
                Math.min(closest, 200);

            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        chosen.push(remaining[bestIndex]);
        remaining.splice(bestIndex, 1);
    }

    return chosen.sort(
        (a, b) => b.population - a.population
    );
}


/**
 * Reads an image file and returns its dominant colours, most common
 * first.
 */
export async function extractColorsFromFile(
    file: File,
    count = 5
): Promise<SampledColor[]> {
    const bitmap = await createImageBitmap(file);

    const scale = Math.min(
        1,
        MAX_SAMPLE_EDGE /
            Math.max(bitmap.width, bitmap.height)
    );

    const width = Math.max(
        1,
        Math.round(bitmap.width * scale)
    );
    const height = Math.max(
        1,
        Math.round(bitmap.height * scale)
    );

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
        willReadFrequently: true,
    });

    if (!context) {
        bitmap.close?.();

        throw new Error(
            "This browser could not read that image."
        );
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const data = context.getImageData(
        0,
        0,
        width,
        height
    ).data;

    const buckets = buildHistogram(data);

    const total = buckets.reduce(
        (sum, bucket) => sum + bucket.count,
        0
    );

    if (total === 0) {
        throw new Error(
            "That image had no visible pixels to sample."
        );
    }

    const sampled = pickPalette(
        mergeSimilar(
            buckets.map(bucketColor)
        ).filter(
            (color) => color.population > 0
        ),
        count
    );

    if (sampled.length === 0) {
        throw new Error(
            "No colours could be sampled from that image."
        );
    }

    return sampled.map((color) => ({
        ...color,
        population: color.population / total,
    }));
}

export type PaletteRead = {
    brightness: "light" | "mid" | "dark";
    intensity: "neutral" | "muted" | "vivid";
};

/**
 * Human-readable read of a palette. Used to nudge the model and to
 * label the result without a second round trip.
 */
export function describePalette(
    colors: string[]
): PaletteRead {
    if (colors.length === 0) {
        return { brightness: "mid", intensity: "muted" };
    }

    const averageLight =
        colors.reduce(
            (sum, hex) => sum + lightness(hex),
            0
        ) / colors.length;

    const averageChroma =
        colors.reduce(
            (sum, hex) => sum + chroma(hex),
            0
        ) / colors.length;

    return {
        brightness:
            averageLight > 0.66
                ? "light"
                : averageLight < 0.34
                    ? "dark"
                    : "mid",

        intensity:
            averageChroma < 0.035
                ? "neutral"
                : averageChroma < 0.45
                    ? "muted"
                    : "vivid",
    };
}
