const {
    getAesthetic,
} = require("../../data/aesthetics");

const {
    getMood,
} = require("../../data/moods");

const PALETTE_SIZE = 5;

function clamp(value, min, max) {
    return Math.min(
        Math.max(value, min),
        max
    );
}

function hexToRgb(hex) {
    const cleanHex =
        hex.replace("#", "");

    return {
        r: parseInt(
            cleanHex.substring(0, 2),
            16
        ),

        g: parseInt(
            cleanHex.substring(2, 4),
            16
        ),

        b: parseInt(
            cleanHex.substring(4, 6),
            16
        ),
    };
}

function rgbToHex({
    r,
    g,
    b,
}) {
    const toHex = (value) =>
        clamp(
            Math.round(value),
            0,
            255
        )
            .toString(16)
            .padStart(2, "0");

    return (
        `#${toHex(r)}` +
        `${toHex(g)}` +
        `${toHex(b)}`
    ).toUpperCase();
}

function mixColors(
    first,
    second,
    amount
) {
    const a =
        hexToRgb(first);

    const b =
        hexToRgb(second);

    return rgbToHex({
        r:
            a.r +
            (b.r - a.r) *
                amount,

        g:
            a.g +
            (b.g - a.g) *
                amount,

        b:
            a.b +
            (b.b - a.b) *
                amount,
    });
}

function adjustColor(
    hex,
    {
        brightness = 0,
        saturation = 0,
    } = {}
) {
    let {
        r,
        g,
        b,
    } = hexToRgb(hex);

    if (brightness !== 0) {
        const target =
            brightness > 0
                ? 255
                : 0;

        const amount =
            Math.abs(
                brightness
            );

        r +=
            (target - r) *
            amount;

        g +=
            (target - g) *
            amount;

        b +=
            (target - b) *
            amount;
    }

    if (saturation !== 0) {
        const average =
            (r + g + b) / 3;

        const multiplier =
            1 + saturation;

        r =
            average +
            (r - average) *
                multiplier;

        g =
            average +
            (g - average) *
                multiplier;

        b =
            average +
            (b - average) *
                multiplier;
    }

    return rgbToHex({
        r,
        g,
        b,
    });
}

const moodAdjustments = {
    dreamy: {
        brightness: 0.18,
        saturation: -0.05,
    },

    soft: {
        brightness: 0.25,
        saturation: -0.15,
    },

    romantic: {
        brightness: 0.08,
        saturation: 0.08,
    },

    moody: {
        brightness: -0.25,
        saturation: -0.05,
    },

    mysterious: {
        brightness: -0.18,
        saturation: 0.05,
    },

    energetic: {
        brightness: 0.05,
        saturation: 0.25,
    },

    calm: {
        brightness: 0.12,
        saturation: -0.12,
    },

    elegant: {
        brightness: 0.04,
        saturation: -0.08,
    },

    dramatic: {
        brightness: -0.08,
        saturation: 0.3,
    },

    eerie: {
        brightness: -0.2,
        saturation: -0.08,
    },

    nostalgic: {
        brightness: 0.08,
        saturation: -0.18,
    },

    peaceful: {
        brightness: 0.18,
        saturation: -0.18,
    },

    minimal: {
        brightness: 0.12,
        saturation: -0.35,
    },
};

function randomBetween(
    min,
    max
) {
    return (
        Math.random() *
            (max - min) +
        min
    );
}

function createVariant(
    color,
    moodId = null
) {
    const mood =
        moodAdjustments[
            moodId
        ] || {
            brightness: 0,
            saturation: 0,
        };

    const brightnessJitter =
        randomBetween(
            -0.12,
            0.12
        );

    const saturationJitter =
        randomBetween(
            -0.08,
            0.08
        );

    return adjustColor(
        color,
        {
            brightness:
                clamp(
                    mood.brightness +
                        brightnessJitter,
                    -0.6,
                    0.6
                ),

            saturation:
                clamp(
                    mood.saturation +
                        saturationJitter,
                    -0.6,
                    0.6
                ),
        }
    );
}

function generatePaletteColors(
    baseColors,
    moodId = null
) {
    if (
        !Array.isArray(
            baseColors
        ) ||
        baseColors.length === 0
    ) {
        throw new Error(
            "Aesthetic has no base colors."
        );
    }

    const palette = [];

    let attempts = 0;

    while (
        palette.length <
            PALETTE_SIZE &&
        attempts < 50
    ) {
        attempts += 1;

        const first =
            baseColors[
                Math.floor(
                    Math.random() *
                        baseColors.length
                )
            ];

        const second =
            baseColors[
                Math.floor(
                    Math.random() *
                        baseColors.length
                )
            ];

        const mixed =
            first === second
                ? first
                : mixColors(
                      first,
                      second,
                      randomBetween(
                          0.15,
                          0.85
                      )
                  );

        const variant =
            createVariant(
                mixed,
                moodId
            );

        if (
            !palette.includes(
                variant
            )
        ) {
            palette.push(
                variant
            );
        }
    }

    while (
        palette.length <
        PALETTE_SIZE
    ) {
        palette.push(
            createVariant(
                baseColors[
                    palette.length %
                        baseColors.length
                ],
                moodId
            )
        );
    }

    return palette;
}

async function generatePalette({
    aestheticId,
    moodId = null,
}) {
    const aesthetic =
        getAesthetic(
            aestheticId
        );

    if (!aesthetic) {
        throw new Error(
            `Unknown aesthetic: ${aestheticId}`
        );
    }

    const mood =
        moodId
            ? getMood(
                  moodId
              )
            : null;

    if (
        moodId &&
        !mood
    ) {
        throw new Error(
            `Unknown mood: ${moodId}`
        );
    }

    const colors =
        generatePaletteColors(
            aesthetic.colors,
            moodId
        );

    return {
        colors,
        aesthetic,
        mood,
    };
}

module.exports = {
    generatePalette,
    generatePaletteColors,
    PALETTE_SIZE,
};