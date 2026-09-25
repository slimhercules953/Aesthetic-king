const symbolCatalog = {
    gothic: {
        singles: [
            "†",
            "☾",
            "✦",
            "♱",
            "⋆",
            "☽",
            "✧",
        ],

        combinations: [
            "☾ ✦ ☽",
            "† ⋆ †",
            "♱ ✦ ♱",
            "☾ † ☽",
            "✦ ⋆ ✦",
        ],

        dividers: [
            "─── ✦ ───",
            "☾ ───── ☽",
            "† ⋆ ─ ⋆ †",
            "♱ ─ ✦ ─ ♱",
        ],
    },

    dark: {
        singles: [
            "✦",
            "☾",
            "⋆",
            "✧",
            "◇",
            "●",
        ],

        combinations: [
            "☾ ⋆ ✦",
            "✦ ◇ ✦",
            "● ⋆ ●",
            "☾ ✧ ☽",
        ],

        dividers: [
            "─── ⋆ ───",
            "✦ ───── ✦",
            "☾ ─ ✧ ─ ☽",
        ],
    },

    kawaii: {
        singles: [
            "♡",
            "୨୧",
            "✦",
            "✧",
            "☆",
            "☁",
            "✿",
        ],

        combinations: [
            "୨୧ ♡ ୨୧",
            "✧ ♡ ✧",
            "☁ ♡ ☁",
            "☆ ✦ ☆",
            "✿ ♡ ✿",
        ],

        dividers: [
            "୨୧ ─ ♡ ─ ୨୧",
            "✧ ───── ✧",
            "♡ ⋆ ─ ⋆ ♡",
        ],
    },

    pastel: {
        singles: [
            "♡",
            "✿",
            "☁",
            "✧",
            "⋆",
            "୨୧",
        ],

        combinations: [
            "☁ ✧ ☁",
            "♡ ⋆ ♡",
            "✿ ✧ ✿",
            "୨୧ ♡ ୨୧",
        ],

        dividers: [
            "☁ ───── ☁",
            "✿ ─ ✧ ─ ✿",
            "♡ ⋆ ─ ⋆ ♡",
        ],
    },

    dreamcore: {
        singles: [
            "☁",
            "☾",
            "✦",
            "⋆",
            "✧",
            "☽",
            "◇",
        ],

        combinations: [
            "☾ ⋆ ☽",
            "☁ ✦ ☁",
            "✧ ◇ ✧",
            "☾ ✦ ☽",
        ],

        dividers: [
            "☾ ───── ☽",
            "☁ ⋆ ─ ⋆ ☁",
            "✧ ─ ◇ ─ ✧",
        ],
    },

    cyber: {
        singles: [
            "⌁",
            "⟡",
            "⚡",
            "⌬",
            "◈",
            "◇",
            "∆",
        ],

        combinations: [
            "⌁ ⚡ ⌁",
            "◈ ⟡ ◈",
            "∆ ⌬ ∆",
            "⚡ ◇ ⚡",
        ],

        dividers: [
            "⌁ ─ ⚡ ─ ⌁",
            "◈ ───── ◈",
            "∆ ⌬ ─ ⌬ ∆",
        ],
    },

    vaporwave: {
        singles: [
            "△",
            "◇",
            "☼",
            "✦",
            "░",
            "☆",
        ],

        combinations: [
            "△ ✦ △",
            "◇ ☼ ◇",
            "░ ☆ ░",
            "☼ ✦ ☼",
        ],

        dividers: [
            "△ ───── △",
            "◇ ─ ☼ ─ ◇",
            "░░ ✦ ░░",
        ],
    },

    cottagecore: {
        singles: [
            "❀",
            "✿",
            "☘",
            "♡",
            "☁",
            "✧",
        ],

        combinations: [
            "❀ ♡ ❀",
            "☘ ✧ ☘",
            "✿ ♡ ✿",
            "☁ ❀ ☁",
        ],

        dividers: [
            "❀ ───── ❀",
            "☘ ─ ✧ ─ ☘",
            "✿ ♡ ─ ♡ ✿",
        ],
    },

    minimalist: {
        singles: [
            "·",
            "—",
            "○",
            "◦",
            "◇",
            "⌁",
        ],

        combinations: [
            "○ · ○",
            "◇ — ◇",
            "◦ · ◦",
        ],

        dividers: [
            "────────",
            "○ ───── ○",
            "◇ ─ ◇",
        ],
    },

    y2k: {
        singles: [
            "☆",
            "♡",
            "✧",
            "★",
            "◇",
            "☼",
        ],

        combinations: [
            "☆ ♡ ☆",
            "★ ✧ ★",
            "◇ ♡ ◇",
            "☼ ☆ ☼",
        ],

        dividers: [
            "☆ ─ ♡ ─ ☆",
            "★ ───── ★",
            "◇ ✧ ─ ✧ ◇",
        ],
    },

    romantic: {
        singles: [
            "♡",
            "♥",
            "❦",
            "୨୧",
            "✧",
            "❀",
        ],

        combinations: [
            "♡ ❦ ♡",
            "୨୧ ♥ ୨୧",
            "✧ ♡ ✧",
            "❀ ♥ ❀",
        ],

        dividers: [
            "♡ ───── ♡",
            "❦ ─ ♥ ─ ❦",
            "୨୧ ✧ ─ ✧ ୨୧",
        ],
    },

    soft: {
        singles: [
            "♡",
            "☁",
            "୨୧",
            "✿",
            "✧",
            "⋆",
        ],

        combinations: [
            "☁ ♡ ☁",
            "୨୧ ✧ ୨୧",
            "✿ ♡ ✿",
            "⋆ ♡ ⋆",
        ],

        dividers: [
            "☁ ───── ☁",
            "୨୧ ─ ♡ ─ ୨୧",
            "✿ ✧ ─ ✧ ✿",
        ],
    },

    anime: {
        singles: [
            "☆",
            "♡",
            "✦",
            "〜",
            "ツ",
            "✧",
        ],

        combinations: [
            "☆ ✦ ☆",
            "♡ 〜 ♡",
            "✧ ツ ✧",
            "✦ ♡ ✦",
        ],

        dividers: [
            "☆ ───── ☆",
            "♡ 〜 ─ 〜 ♡",
            "✦ ─ ✧ ─ ✦",
        ],
    },

    horror: {
        singles: [
            "☠",
            "†",
            "⛧",
            "☾",
            "✦",
            "♱",
        ],

        combinations: [
            "☠ † ☠",
            "⛧ ✦ ⛧",
            "☾ ♱ ☽",
            "† ☠ †",
        ],

        dividers: [
            "☠ ───── ☠",
            "† ─ ⛧ ─ †",
            "☾ ♱ ─ ♱ ☽",
        ],
    },

    nature: {
        singles: [
            "❀",
            "☘",
            "✿",
            "☁",
            "✧",
            "♡",
        ],

        combinations: [
            "☘ ✿ ☘",
            "❀ ♡ ❀",
            "☁ ✧ ☁",
        ],

        dividers: [
            "☘ ───── ☘",
            "❀ ─ ✿ ─ ❀",
            "☁ ✧ ─ ✧ ☁",
        ],
    },

    luxury: {
        singles: [
            "✦",
            "◇",
            "♛",
            "❦",
            "✧",
            "◆",
        ],

        combinations: [
            "♛ ✦ ♛",
            "◇ ❦ ◇",
            "◆ ✧ ◆",
        ],

        dividers: [
            "♛ ───── ♛",
            "◇ ─ ✦ ─ ◇",
            "❦ ─ ◆ ─ ❦",
        ],
    },

    grunge: {
        singles: [
            "✦",
            "×",
            "†",
            "★",
            "☾",
            "◇",
        ],

        combinations: [
            "× † ×",
            "★ ✦ ★",
            "☾ × ☽",
            "† ◇ †",
        ],

        dividers: [
            "× ───── ×",
            "† ─ ✦ ─ †",
            "★ × ─ × ★",
        ],
    },

    monochrome: {
        singles: [
            "○",
            "●",
            "◇",
            "◆",
            "—",
            "✦",
        ],

        combinations: [
            "○ ● ○",
            "◇ ◆ ◇",
            "✦ ○ ✦",
        ],

        dividers: [
            "○ ───── ○",
            "◇ ─ ◆ ─ ◇",
            "● ───── ●",
        ],
    },
};

function getSymbolsForAesthetic(
    aestheticId
) {
    if (!aestheticId) {
        return null;
    }

    return (
        symbolCatalog[
            aestheticId
                .toLowerCase()
                .trim()
        ] || null
    );
}

module.exports = {
    symbolCatalog,
    getSymbolsForAesthetic,
};