// WCAG 2.1 contrast maths + CIE76 color distance.
// Used by the legibility audit so palettes are judged on real numbers
// instead of "it looks fine on my screen".

const DISCORD_THEMES = {
    dark: {
        id: "dark",
        name: "Dark",
        background: "#313338",
        text: "#DBDFE4",
    },
    light: {
        id: "light",
        name: "Light",
        background: "#FFFFFF",
        text: "#23262A",
    },
};

const THEME_LIST = [DISCORD_THEMES.dark, DISCORD_THEMES.light];

const WHITE = "#ffffff";
const BLACK = "#000000";

function pad2(value) {
    return value.toString(16).padStart(2, "0");
}

function clampChannel(value) {
    return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * Accepts "#abc", "abc", "#aabbcc", "aabbcc" (case-insensitive).
 * Returns a normalized "#aabbcc" or null.
 */
function normalizeHex(input) {
    if (typeof input !== "string") {
        return null;
    }

    let value = input.trim().replace(/^#/, "");

    if (/^[0-9a-f]{3}$/i.test(value)) {
        value = value
            .split("")
            .map((char) => char + char)
            .join("");
    }

    if (!/^[0-9a-f]{6}$/i.test(value)) {
        return null;
    }

    return `#${value.toLowerCase()}`;
}

/**
 * Pulls every hex-like token out of free text, e.g. a user pasting
 * "#ff0044 2b2d31, rgb-ish junk #0a0a0a".
 */
function parseHexList(input) {
    if (typeof input !== "string" || !input.trim()) {
        return [];
    }

    const matches = input.match(/#?[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?/g) || [];

    const seen = new Set();
    const colors = [];

    for (const match of matches) {
        const normalized = normalizeHex(match);

        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        colors.push(normalized);
    }

    return colors;
}

function hexToRgb(hex) {
    const normalized = normalizeHex(hex);

    if (!normalized) {
        return null;
    }

    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16),
    };
}

function rgbToHex({ r, g, b }) {
    return `#${pad2(clampChannel(r))}${pad2(clampChannel(g))}${pad2(clampChannel(b))}`;
}

function toLinear(channel) {
    const s = channel / 255;

    return s <= 0.03928
        ? s / 12.92
        : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);

    if (!rgb) {
        return 0;
    }

    return (
        0.2126 * toLinear(rgb.r) +
        0.7152 * toLinear(rgb.g) +
        0.0722 * toLinear(rgb.b)
    );
}

/** WCAG contrast ratio, 1 → 21. */
function contrastRatio(hexA, hexB) {
    const lumA = relativeLuminance(hexA);
    const lumB = relativeLuminance(hexB);

    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);

    return (lighter + 0.05) / (darker + 0.05);
}

function formatRatio(ratio) {
    return `${ratio.toFixed(2)}:1`;
}

/**
 * WCAG bands. Discord usernames and role colors are "large-ish" text in
 * practice, but body copy needs 4.5, so the bands stay strict.
 */
function rating(ratio) {
    if (ratio >= 7) {
        return {
            label: "Excellent",
            emoji: "🟢",
            passesAA: true,
            passesAAA: true,
        };
    }

    if (ratio >= 4.5) {
        return {
            label: "Good",
            emoji: "🟢",
            passesAA: true,
            passesAAA: false,
        };
    }

    if (ratio >= 3) {
        return {
            label: "Large text only",
            emoji: "🟡",
            passesAA: false,
            passesAAA: false,
        };
    }

    return {
        label: "Hard to read",
        emoji: "🔴",
        passesAA: false,
        passesAAA: false,
    };
}

/** The text color that stays most readable on top of `hex`. */
function bestTextOn(hex) {
    return contrastRatio(hex, WHITE) >= contrastRatio(hex, BLACK)
        ? WHITE
        : BLACK;
}

function lab(hex) {
    const rgb = hexToRgb(hex);

    if (!rgb) {
        return { l: 0, a: 0, b: 0 };
    }

    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);

    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

    const pivot = (t) =>
        t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

    const fx = pivot(x);
    const fy = pivot(y);
    const fz = pivot(z);

    return {
        l: 116 * fy - 16,
        a: 500 * (fx - fy),
        b: 200 * (fy - fz),
    };
}

/** CIE76 ΔE. Under ~10 the two colors read as "the same" side by side. */
function colorDistance(hexA, hexB) {
    const a = lab(hexA);
    const b = lab(hexB);

    return Math.sqrt(
        (a.l - b.l) ** 2 +
        (a.a - b.a) ** 2 +
        (a.b - b.b) ** 2
    );
}

function analyzeColor(hex) {
    const normalized = normalizeHex(hex) || hex;

    const onDark = contrastRatio(normalized, DISCORD_THEMES.dark.background);
    const onLight = contrastRatio(normalized, DISCORD_THEMES.light.background);

    const asText = Math.min(onDark, onLight);

    return {
        hex: normalized,
        rgb: hexToRgb(normalized),
        luminance: relativeLuminance(normalized),
        onDark: {
            ratio: onDark,
            ...rating(onDark),
        },
        onLight: {
            ratio: onLight,
            ...rating(onLight),
        },
        // Contrast of Discord's own default text sitting on top of this color
        // (banners, role hoisting, embed swatches).
        withThemeText: {
            dark: {
                ratio: contrastRatio(normalized, DISCORD_THEMES.dark.text),
                ...rating(contrastRatio(normalized, DISCORD_THEMES.dark.text)),
            },
            light: {
                ratio: contrastRatio(normalized, DISCORD_THEMES.light.text),
                ...rating(contrastRatio(normalized, DISCORD_THEMES.light.text)),
            },
        },
        bestText: bestTextOn(normalized),
        // A color is only "safe everywhere" if it clears AA as text on BOTH
        // Discord themes. Very few colors do, which is the whole point.
        worksEverywhere: asText >= 4.5,
        usableSomewhere: onDark >= 4.5 || onLight >= 4.5,
        // Clears the 3:1 large-text bar on both themes — usable as a big
        // username color, just not as body copy.
        largeTextEverywhere: asText >= 3,
    };
}

function auditPalette(colors) {
    const analyzed = colors
        .map((color) => normalizeHex(color))
        .filter(Boolean)
        .map(analyzeColor);

    const duplicates = [];

    for (let i = 0; i < analyzed.length; i += 1) {
        for (let j = i + 1; j < analyzed.length; j += 1) {
            const distance = colorDistance(
                analyzed[i].hex,
                analyzed[j].hex
            );

            if (distance < 12) {
                duplicates.push({
                    a: analyzed[i].hex,
                    b: analyzed[j].hex,
                    distance,
                });
            }
        }
    }

    const safe = analyzed.filter((color) => color.worksEverywhere);
    const darkOnly = analyzed.filter(
        (color) =>
            color.onDark.ratio >= 4.5 && color.onLight.ratio < 4.5
    );
    const lightOnly = analyzed.filter(
        (color) =>
            color.onLight.ratio >= 4.5 && color.onDark.ratio < 4.5
    );
    const unusable = analyzed.filter(
        (color) => !color.usableSomewhere
    );

    let verdict;

    if (!analyzed.length) {
        verdict = "Nothing to audit.";
    } else if (unusable.length === analyzed.length) {
        verdict = "None of these colors clear AA on either Discord theme.";
    } else if (safe.length === analyzed.length) {
        verdict = "Every color is readable on both Discord themes.";
    } else if (safe.length > 0) {
        verdict =
            `${safe.length} of ${analyzed.length} colors work on both themes. ` +
            "The rest need a theme-specific swap.";
    } else {
        verdict =
            "No color works on both themes — this palette is theme-dependent.";
    }

    return {
        colors: analyzed,
        duplicates,
        counts: {
            total: analyzed.length,
            safe: safe.length,
            darkOnly: darkOnly.length,
            lightOnly: lightOnly.length,
            unusable: unusable.length,
        },
        verdict,
    };
}

module.exports = {
    DISCORD_THEMES,
    THEME_LIST,
    normalizeHex,
    parseHexList,
    hexToRgb,
    rgbToHex,
    relativeLuminance,
    contrastRatio,
    formatRatio,
    rating,
    bestTextOn,
    colorDistance,
    analyzeColor,
    auditPalette,
};
