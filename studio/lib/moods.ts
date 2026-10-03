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

/*
 * Mirrors MOOD_ALIASES in the bot's aestheticService. The asset catalog
 * tags sets with atmospheric words ("night", "ethereal", "retro") that
 * are not mood ids, so a tag has to be folded back onto the option list
 * before it can be stored on a saved aesthetic.
 */
const MOOD_ALIASES: Record<string, string[]> = {
    dreamy: ["ethereal", "surreal", "floaty"],
    soft: ["gentle", "cute", "delicate"],
    romantic: ["affectionate", "intimate"],
    moody: ["dark", "melancholic", "night", "atmospheric"],
    mysterious: ["enigmatic", "secretive"],
    energetic: ["vibrant", "bold", "active"],
    calm: ["relaxed", "quiet"],
    elegant: ["refined", "sophisticated", "graceful"],
    dramatic: ["intense", "expressive"],
    eerie: ["ominous", "macabre", "haunting", "unsettling"],
    nostalgic: ["retro", "sentimental"],
    peaceful: ["tranquil", "serene", "natural"],
    minimal: ["clean", "restrained", "simple"],
};

const MOOD_TAG_LOOKUP = new Map<string, string>();

for (const [moodId, aliases] of Object.entries(
    MOOD_ALIASES
)) {
    for (const alias of aliases) {
        const normalized =
            alias.trim().toLowerCase();

        if (
            normalized &&
            !MOOD_TAG_LOOKUP.has(normalized)
        ) {
            MOOD_TAG_LOOKUP.set(normalized, moodId);
        }
    }
}

/*
 * Picks the single mood that best describes a set: a tag that is already
 * a mood id wins, then a tag that is an alias of one, then the raw tag so
 * the field is never empty when the catalog has something to say.
 */
export function resolveMoodTag(
    tags: string[] | null | undefined
): string | null {
    const normalized = (Array.isArray(tags)
        ? tags
        : []
    )
        .map((tag) =>
            String(tag ?? "")
                .trim()
                .toLowerCase()
        )
        .filter(Boolean);

    if (normalized.length === 0) {
        return null;
    }

    const canonical = normalized.find(
        (tag) => isValidMoodId(tag)
    );

    if (canonical) {
        return canonical;
    }

    const aliased = normalized.find(
        (tag) => MOOD_TAG_LOOKUP.has(tag)
    );

    if (aliased) {
        return (
            MOOD_TAG_LOOKUP.get(aliased) ??
            null
        );
    }

    return normalized[0];
}

export function resolveColorTag(
    tags: string[] | null | undefined
): string | null {
    const normalized = (Array.isArray(tags)
        ? tags
        : []
    )
        .map((tag) =>
            String(tag ?? "")
                .trim()
                .toLowerCase()
        )
        .filter(Boolean);

    return normalized[0] ?? null;
}