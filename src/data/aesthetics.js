const aesthetics = {
    gothic: {
        id: "gothic",
        name: "Gothic",
        description:
            "Dark, dramatic, mysterious, and elegant.",
        moods: [
            "dark",
            "mysterious",
            "dramatic",
            "elegant",
            "romantic",
        ],
        colors: [
            "#0D0D0D",
            "#2B0A14",
            "#6B1028",
            "#8C8C8C",
            "#E6E6E6",
        ],
        symbols: [
            "†",
            "☾",
            "✦",
            "♱",
            "𖤐",
        ],
        aiGuidance:
            "Use dark, elegant, mysterious, romantic, and slightly dramatic language. Avoid excessive edginess or gore.",
    },

    dark: {
        id: "dark",
        name: "Dark",
        description:
            "Moody, shadowy, minimal, and atmospheric.",
        moods: [
            "moody",
            "shadowy",
            "minimal",
            "mysterious",
        ],
        colors: [
            "#050505",
            "#111111",
            "#242424",
            "#555555",
            "#D6D6D6",
        ],
        symbols: [
            "✦",
            "☾",
            "⋆",
            "⛧",
            "✧",
        ],
        aiGuidance:
            "Use concise, atmospheric, mysterious language with a dark modern tone.",
    },

    kawaii: {
        id: "kawaii",
        name: "Kawaii",
        description:
            "Cute, playful, colorful, and cheerful.",
        moods: [
            "cute",
            "playful",
            "sweet",
            "cheerful",
        ],
        colors: [
            "#FFB7D5",
            "#FFD6E7",
            "#CDB4FF",
            "#BDE0FE",
            "#FFF1F7",
        ],
        symbols: [
            "♡",
            "୨୧",
            "₊˚",
            "꒰ა",
            "໒꒱",
        ],
        aiGuidance:
            "Use cute, playful, sweet language with tasteful kaomoji and decorative symbols without making the bio unreadable.",
    },

    pastel: {
        id: "pastel",
        name: "Pastel",
        description:
            "Soft colors, gentle energy, and dreamy simplicity.",
        moods: [
            "soft",
            "gentle",
            "dreamy",
            "calm",
        ],
        colors: [
            "#FFD6E8",
            "#D8C7FF",
            "#CDEBFF",
            "#D7F7E3",
            "#FFF4CC",
        ],
        symbols: [
            "♡",
            "✿",
            "₊˚",
            "✧",
            "☁",
        ],
        aiGuidance:
            "Use soft, comforting, dreamy language with light decorative symbols.",
    },

    dreamcore: {
        id: "dreamcore",
        name: "Dreamcore",
        description:
            "Surreal, nostalgic, ethereal, and dreamlike.",
        moods: [
            "dreamlike",
            "surreal",
            "nostalgic",
            "ethereal",
        ],
        colors: [
            "#B8A7FF",
            "#FFB9DE",
            "#9EDFFF",
            "#FFF3B0",
            "#E7E0FF",
        ],
        symbols: [
            "☁",
            "☾",
            "✦",
            "⋆",
            "𓆩♡𓆪",
        ],
        aiGuidance:
            "Use surreal, nostalgic, ethereal language that feels like fragments of a dream.",
    },

    cyber: {
        id: "cyber",
        name: "Cyber",
        description:
            "Futuristic, digital, neon, and technological.",
        moods: [
            "futuristic",
            "digital",
            "neon",
            "energetic",
        ],
        colors: [
            "#050510",
            "#00F5FF",
            "#8A2BE2",
            "#FF00C8",
            "#E8FFFF",
        ],
        symbols: [
            "⌁",
            "⟡",
            "⚡",
            "⌬",
            "◈",
        ],
        aiGuidance:
            "Use futuristic digital language with subtle technological terminology and clean cyber-inspired symbols.",
    },

    vaporwave: {
        id: "vaporwave",
        name: "Vaporwave",
        description:
            "Retro digital nostalgia with neon sunset energy.",
        moods: [
            "retro",
            "nostalgic",
            "neon",
            "dreamy",
        ],
        colors: [
            "#FF71CE",
            "#01CDFE",
            "#B967FF",
            "#05FFA1",
            "#FFFB96",
        ],
        symbols: [
            "△",
            "◇",
            "☼",
            "✦",
            "░",
        ],
        aiGuidance:
            "Use retro-futuristic, nostalgic internet language inspired by neon nights and digital nostalgia.",
    },

    cottagecore: {
        id: "cottagecore",
        name: "Cottagecore",
        description:
            "Nature, warmth, flowers, forests, and quiet comfort.",
        moods: [
            "natural",
            "warm",
            "peaceful",
            "rustic",
        ],
        colors: [
            "#7A8450",
            "#B8A47E",
            "#E6D5B8",
            "#A8B98A",
            "#FFF8E8",
        ],
        symbols: [
            "❀",
            "𖡼",
            "𖤣",
            "𖥧",
            "🌿",
        ],
        aiGuidance:
            "Use peaceful nature-inspired language involving warmth, flowers, forests, gardens, and simple living.",
    },

    minimalist: {
        id: "minimalist",
        name: "Minimalist",
        description:
            "Clean, restrained, modern, and intentional.",
        moods: [
            "clean",
            "calm",
            "modern",
            "simple",
        ],
        colors: [
            "#111111",
            "#444444",
            "#888888",
            "#D4D4D4",
            "#F5F5F5",
        ],
        symbols: [
            "·",
            "—",
            "○",
            "◦",
            "⌁",
        ],
        aiGuidance:
            "Use extremely clean, concise language. Avoid excessive emojis, symbols, decorative text, or clutter.",
    },

    y2k: {
        id: "y2k",
        name: "Y2K",
        description:
            "Glossy early-internet futurism and playful 2000s nostalgia.",
        moods: [
            "nostalgic",
            "playful",
            "futuristic",
            "glossy",
        ],
        colors: [
            "#FF66CC",
            "#99DDFF",
            "#C8B6FF",
            "#E8E8E8",
            "#6C63FF",
        ],
        symbols: [
            "☆",
            "♡",
            "✧",
            "★",
            "꩜",
        ],
        aiGuidance:
            "Use playful early-2000s internet-inspired language with glossy, futuristic, nostalgic energy.",
    },

    romantic: {
        id: "romantic",
        name: "Romantic",
        description:
            "Elegant, affectionate, poetic, and intimate.",
        moods: [
            "romantic",
            "poetic",
            "warm",
            "elegant",
        ],
        colors: [
            "#7D243D",
            "#C65B7C",
            "#F2B5C4",
            "#F8DDE5",
            "#FFF5F7",
        ],
        symbols: [
            "♡",
            "♥",
            "❦",
            "୨୧",
            "✧",
        ],
        aiGuidance:
            "Use warm, poetic, elegant language with subtle romantic imagery and tasteful decorative symbols.",
    },

    soft: {
        id: "soft",
        name: "Soft",
        description:
            "Comforting, gentle, cozy, and understated.",
        moods: [
            "gentle",
            "cozy",
            "calm",
            "sweet",
        ],
        colors: [
            "#F4D7E7",
            "#DCD6F7",
            "#D6E5FA",
            "#E7F2E4",
            "#FAF3E7",
        ],
        symbols: [
            "♡",
            "☁",
            "₊˚",
            "୨୧",
            "✿",
        ],
        aiGuidance:
            "Use gentle, cozy, reassuring language with light decorative elements.",
    },

    anime: {
        id: "anime",
        name: "Anime",
        description:
            "Expressive, colorful, energetic, and character-inspired.",
        moods: [
            "expressive",
            "energetic",
            "colorful",
            "playful",
        ],
        colors: [
            "#FF6B9E",
            "#7667FF",
            "#62D9FF",
            "#FFD166",
            "#F8F8FF",
        ],
        symbols: [
            "☆",
            "♡",
            "✦",
            "〜",
            "ツ",
        ],
        aiGuidance:
            "Use expressive and energetic language inspired by anime aesthetics without imitating or quoting copyrighted characters.",
    },
};

function getAesthetic(id) {
    if (!id) {
        return null;
    }

    return (
        aesthetics[
            id.toLowerCase().trim()
        ] || null
    );
}

function getAesthetics() {
    return Object.values(aesthetics);
}

function getAestheticChoices() {
    return getAesthetics().map(
        (aesthetic) => ({
            name: aesthetic.name,
            value: aesthetic.id,
        })
    );
}

module.exports = {
    aesthetics,
    getAesthetic,
    getAesthetics,
    getAestheticChoices,
};