const assetCatalog =
    require("../../data/assetCatalog.json");

const {
    getAesthetic,
} = require("../../data/aesthetics");

const {
    getCompleteProfileSets,
} = require("../assets/assetService");

function normalizeTag(value) {
    if (!value) {
        return null;
    }

    return value
        .toLowerCase()
        .trim();
}

const MOOD_ALIASES = {
    dreamy: [
        "dreamy",
        "ethereal",
        "surreal",
        "floaty",
    ],

    soft: [
        "soft",
        "gentle",
        "cute",
        "delicate",
    ],

    romantic: [
        "romantic",
        "affectionate",
        "intimate",
    ],

    moody: [
        "moody",
        "dark",
        "melancholic",
        "night",
        "atmospheric",
    ],

    mysterious: [
        "mysterious",
        "enigmatic",
        "secretive",
    ],

    energetic: [
        "energetic",
        "vibrant",
        "bold",
        "active",
    ],

    calm: [
        "calm",
        "relaxed",
        "quiet",
    ],

    elegant: [
        "elegant",
        "refined",
        "sophisticated",
        "graceful",
    ],

    dramatic: [
        "dramatic",
        "intense",
        "expressive",
    ],

    eerie: [
        "eerie",
        "ominous",
        "macabre",
        "haunting",
        "unsettling",
    ],

    nostalgic: [
        "nostalgic",
        "retro",
        "sentimental",
    ],

    peaceful: [
        "peaceful",
        "tranquil",
        "serene",
        "natural",
    ],

    minimal: [
        "minimal",
        "clean",
        "restrained",
        "simple",
    ],
};

function matchesMood(
    assetMoods = [],
    requestedMood
) {
    if (!requestedMood) {
        return true;
    }

    const normalizedRequestedMood =
        normalizeTag(requestedMood);

    const acceptedMoods =
        MOOD_ALIASES[
        normalizedRequestedMood
        ] || [
            normalizedRequestedMood,
        ];

    const normalizedAssetMoods =
        assetMoods.map(normalizeTag);

    return acceptedMoods.some(
        (mood) =>
            normalizedAssetMoods.includes(
                normalizeTag(mood)
            )
    );
}

function getCatalogSetsByAesthetic(
    aestheticId
) {
    const normalizedId =
        normalizeTag(aestheticId);

    const aesthetic =
        getAesthetic(normalizedId);

    if (!aesthetic) {
        throw new Error(
            `Unknown aesthetic: ${aestheticId}`
        );
    }

    return assetCatalog.filter(
        (set) =>
            set.enabled !== false &&
            Array.isArray(
                set.aesthetics
            ) &&
            set.aesthetics.includes(
                normalizedId
            )
    );
}

function getCatalogSetsByColor(color) {
    const normalizedColor =
        normalizeTag(color);

    if (!normalizedColor) {
        return [];
    }

    return assetCatalog.filter(
        (set) =>
            set.enabled !== false &&
            Array.isArray(set.colors) &&
            set.colors.includes(
                normalizedColor
            )
    );
}

function getCatalogSetsByMood(mood) {
    const normalizedMood =
        normalizeTag(mood);

    if (!normalizedMood) {
        return [];
    }

    return assetCatalog.filter(
        (set) =>
            set.enabled !== false &&
            Array.isArray(set.moods) &&
            matchesMood(
                set.moods,
                normalizedMood
            )
    );
}

function filterCatalog({
    aestheticId = null,
    color = null,
    mood = null,
} = {}) {
    const normalizedAesthetic =
        normalizeTag(aestheticId);

    const normalizedColor =
        normalizeTag(color);

    const normalizedMood =
        normalizeTag(mood);

    if (
        normalizedAesthetic &&
        !getAesthetic(
            normalizedAesthetic
        )
    ) {
        throw new Error(
            `Unknown aesthetic: ${aestheticId}`
        );
    }

    return assetCatalog.filter(
        (set) => {
            if (
                set.enabled === false
            ) {
                return false;
            }

            if (
                normalizedAesthetic &&
                !set.aesthetics?.includes(
                    normalizedAesthetic
                )
            ) {
                return false;
            }

            if (
                normalizedColor &&
                !set.colors?.includes(
                    normalizedColor
                )
            ) {
                return false;
            }

            if (
                normalizedMood &&
                !matchesMood(
                    set.moods,
                    normalizedMood
                )
            ) {
                return false;
            }

            return true;
        }
    );
}

async function resolveCatalogSets(
    catalogSets
) {
    const profileSets =
        await getCompleteProfileSets();

    const profileMap =
        new Map(
            profileSets.map(
                (set) => [
                    set.id,
                    set,
                ]
            )
        );

    return catalogSets
        .map((catalogSet) => {
            const profileSet =
                profileMap.get(
                    catalogSet.id
                );

            if (!profileSet) {
                return null;
            }

            return {
                ...profileSet,

                metadata: {
                    aesthetics:
                        catalogSet.aesthetics ||
                        [],

                    moods:
                        catalogSet.moods ||
                        [],

                    colors:
                        catalogSet.colors ||
                        [],
                },
            };
        })
        .filter(Boolean);
}

async function getMatchingProfileSets(
    filters = {}
) {
    const catalogSets =
        filterCatalog(filters);

    return resolveCatalogSets(
        catalogSets
    );
}

async function getRandomMatchingProfileSet(
    filters = {},
    excludeSetId = null
) {
    const sets =
        await getMatchingProfileSets(
            filters
        );

    if (sets.length === 0) {
        throw new Error(
            "No profile sets match the requested aesthetic filters."
        );
    }

    let availableSets = sets;

    if (
        excludeSetId &&
        sets.length > 1
    ) {
        availableSets =
            sets.filter(
                (set) =>
                    set.id !==
                    excludeSetId
            );
    }

    const randomIndex =
        Math.floor(
            Math.random() *
            availableSets.length
        );

    return availableSets[
        randomIndex
    ];
}

module.exports = {
    getCatalogSetsByAesthetic,
    getCatalogSetsByColor,
    getCatalogSetsByMood,
    filterCatalog,
    getMatchingProfileSets,
    getRandomMatchingProfileSet,
};