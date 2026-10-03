export type MoodOption = {
    id: string;
    name: string;
};

export const MOODS: MoodOption[] = [
    {
        id: "dreamy",
        name: "Dreamy",
    },
    {
        id: "soft",
        name: "Soft",
    },
    {
        id: "romantic",
        name: "Romantic",
    },
    {
        id: "moody",
        name: "Moody",
    },
    {
        id: "mysterious",
        name: "Mysterious",
    },
    {
        id: "energetic",
        name: "Energetic",
    },
    {
        id: "calm",
        name: "Calm",
    },
    {
        id: "elegant",
        name: "Elegant",
    },
    {
        id: "dramatic",
        name: "Dramatic",
    },
    {
        id: "eerie",
        name: "Eerie",
    },
    {
        id: "nostalgic",
        name: "Nostalgic",
    },
    {
        id: "peaceful",
        name: "Peaceful",
    },
    {
        id: "minimal",
        name: "Minimal",
    },
];

export function getMoodOption(
    id: string | null | undefined
): MoodOption | null {
    if (!id) {
        return null;
    }

    const normalizedId =
        id.trim().toLowerCase();

    return (
        MOODS.find(
            (mood) =>
                mood.id ===
                normalizedId
        ) ?? null
    );
}

export function isValidMoodId(
    id: string
): boolean {
    return (
        getMoodOption(id) !==
        null
    );
}