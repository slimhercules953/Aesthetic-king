const moods = [
    {
        id: "dreamy",
        name: "Dreamy",
        description:
            "Ethereal, surreal, floaty, and imaginative.",
    },
    {
        id: "soft",
        name: "Soft",
        description:
            "Gentle, comforting, cute, and delicate.",
    },
    {
        id: "romantic",
        name: "Romantic",
        description:
            "Affectionate, intimate, graceful, and expressive.",
    },
    {
        id: "moody",
        name: "Moody",
        description:
            "Dark, emotional, atmospheric, and introspective.",
    },
    {
        id: "mysterious",
        name: "Mysterious",
        description:
            "Shadowy, enigmatic, secretive, and intriguing.",
    },
    {
        id: "energetic",
        name: "Energetic",
        description:
            "Bold, vibrant, active, and expressive.",
    },
    {
        id: "calm",
        name: "Calm",
        description:
            "Relaxed, quiet, balanced, and understated.",
    },
    {
        id: "elegant",
        name: "Elegant",
        description:
            "Polished, refined, sophisticated, and graceful.",
    },
    {
        id: "dramatic",
        name: "Dramatic",
        description:
            "Intense, expressive, bold, and high-contrast.",
    },
    {
        id: "eerie",
        name: "Eerie",
        description:
            "Unsettling, haunting, ominous, and strange.",
    },
    {
        id: "nostalgic",
        name: "Nostalgic",
        description:
            "Retro, sentimental, familiar, and reminiscent.",
    },
    {
        id: "peaceful",
        name: "Peaceful",
        description:
            "Tranquil, natural, serene, and soothing.",
    },
    {
        id: "minimal",
        name: "Minimal",
        description:
            "Clean, restrained, simple, and uncluttered.",
    },
];

function getMood(id) {
    if (!id) {
        return null;
    }

    return (
        moods.find(
            (mood) =>
                mood.id ===
                id.toLowerCase()
        ) || null
    );
}

function getMoods() {
    return [...moods];
}

function getMoodChoices() {
    return moods.map(
        (mood) => ({
            name: mood.name,
            value: mood.id,
        })
    );
}

module.exports = {
    moods,
    getMood,
    getMoods,
    getMoodChoices,
};