const { createCanvas, loadImage } = require("canvas");

/**
 * A dependency-free replacement for `get-image-colors`.
 *
 * The old package pulled in `request` (deprecated, two critical
 * advisories with no upstream fix) and `get-pixels`, which is where
 * most of the remaining advisories came from. `canvas` is already a
 * direct dependency used elsewhere in the bot, so decoding through it
 * removes the whole chain.
 *
 * The algorithm is median cut over a downsampled copy of the image,
 * which is what `get-image-colors` does. Downsampling to ~100px keeps
 * the palette representative while bounding the work, and skipping
 * transparent pixels stops alpha from washing out the result.
 */

const SAMPLE_SIZE = 100;

/** Pixels darker or lighter than this are treated as background. */
const SATURATION_CUTOFF = 8;

function toHex(r, g, b) {
    return (
        "#" +
        [r, g, b]
            .map((channel) =>
                channel
                    .toString(16)
                    .padStart(2, "0")
            )
            .join("")
    );
}

function readPixels(imageBuffer) {
    return loadImage(imageBuffer).then((image) => {
        const scale = Math.min(
            1,
            SAMPLE_SIZE /
                Math.max(
                    image.width,
                    image.height
                )
        );

        const width = Math.max(
            1,
            Math.round(
                image.width * scale
            )
        );

        const height = Math.max(
            1,
            Math.round(
                image.height * scale
            )
        );

        const canvas =
            createCanvas(
                width,
                height
            );

        const context =
            canvas.getContext("2d");

        context.drawImage(
            image,
            0,
            0,
            width,
            height
        );

        const { data } =
            context.getImageData(
                0,
                0,
                width,
                height
            );

        const pixels = [];

        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];

            if (alpha < 128) {
                continue;
            }

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const spread =
                Math.max(r, g, b) -
                Math.min(r, g, b);

            // Drop near-black and near-white pixels unless they are
            // coloured, so a white background does not dominate.
            if (
                spread <= SATURATION_CUTOFF &&
                (
                    r + g + b < 90 ||
                    r + g + b > 660
                )
            ) {
                continue;
            }

            pixels.push([r, g, b]);
        }

        // An all-background image would otherwise yield nothing.
        if (pixels.length === 0) {
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 128) {
                    continue;
                }

                pixels.push([
                    data[i],
                    data[i + 1],
                    data[i + 2],
                ]);
            }
        }

        return pixels;
    });
}

function channelRange(pixels, channel) {
    let min = 255;
    let max = 0;

    for (const pixel of pixels) {
        const value = pixel[channel];

        if (value < min) {
            min = value;
        }

        if (value > max) {
            max = value;
        }
    }

    return max - min;
}

function medianCut(pixels, depth) {
    if (depth === 0 || pixels.length <= 1) {
        return [pixels];
    }

    const widest = [0, 1, 2]
        .map((channel) => ({
            channel,
            spread:
                channelRange(
                    pixels,
                    channel
                ),
        }))
        .sort(
            (a, b) =>
                b.spread - a.spread
        )[0];

    if (widest.spread === 0) {
        return [pixels];
    }

    const sorted = pixels.slice().sort(
        (a, b) =>
            a[widest.channel] -
            b[widest.channel]
    );

    const middle =
        Math.floor(
            sorted.length / 2
        );

    return [
        ...medianCut(
            sorted.slice(0, middle),
            depth - 1
        ),

        ...medianCut(
            sorted.slice(middle),
            depth - 1
        ),
    ];
}

function averageBucket(pixels) {
    const total = pixels.reduce(
        (accumulator, pixel) => [
            accumulator[0] + pixel[0],
            accumulator[1] + pixel[1],
            accumulator[2] + pixel[2],
        ],
        [0, 0, 0]
    );

    return [
        Math.round(
            total[0] / pixels.length
        ),
        Math.round(
            total[1] / pixels.length
        ),
        Math.round(
            total[2] / pixels.length
        ),
    ];
}

/**
 * Returns the most prominent colours as `{ hex, rgb: { r, g, b } }`
 * objects, where `hex` is an upper-case `#RRGGBB` string. This mirrors
 * the data `get-image-colors` exposed, but as plain properties instead
 * of the `hex()`/`rgb()` accessors that package returned.
 */
async function extractDominantColors(
    imageBuffer,
    count = 5
) {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new TypeError(
            "extractDominantColors requires an image Buffer."
        );
    }

    const pixels =
        await readPixels(
            imageBuffer
        );

    if (pixels.length === 0) {
        return [];
    }

    const target = Math.max(
        1,
        Math.min(
            count,
            pixels.length
        )
    );

    const depth = Math.ceil(
        Math.log2(target)
    );

    const buckets = medianCut(
        pixels,
        depth
    )
        .filter(
            (bucket) =>
                bucket.length > 0
        )
        .sort(
            (a, b) =>
                b.length - a.length
        )
        .slice(0, target);

    return buckets.map((bucket) => {
        const [r, g, b] = averageBucket(bucket);

        return {
            hex: toHex(r, g, b).toUpperCase(),
            rgb: { r, g, b },
            // Share of the sampled pixels this bucket covers. Useful for
            // telling an accent colour apart from the image's dominant one.
            population: bucket.length / pixels.length,
        };
    });
}

module.exports = {
    extractDominantColors,
};
