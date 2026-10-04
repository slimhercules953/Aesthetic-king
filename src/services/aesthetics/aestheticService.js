const assetCatalog =
    require("../../data/assetCatalog.json");

const {
    getAesthetic,
} = require("../../data/aesthetics");

const {
    getMood,
} = require("../../data/moods");

const {
    getCompleteProfileSets,
} = require("../assets/assetService");

/*
 * Premium sets are tagged in the catalog, the same flag the Studio
 * reads. The bot cannot browse the library the way the Studio does, so
 * instead of showing a locked card it keeps premium sets out of the
 * pool entirely and only mentions them when they were the only match.
 */
const {
    PREMIUM_SETS_ONLY_ERROR,
    isPremiumCatalogSet,
    isPremiumOnlyError,
    getUsableSets,
} = require("../assets/premiumSets");

function getUsableCatalogSets(
    catalogSets,
    premiumUnlocked = false
) {
    return getUsableSets(
        catalogSets,
        premiumUnlocked,
        isPremiumCatalogSet
    );
}

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

/*
 * The reverse of MOOD_ALIASES: catalog mood tag -> canonical mood id.
 * The catalog tags sets with atmospheric words ("night", "ethereal",
 * "retro") that are not mood ids, but a saved aesthetic stores a single
 * mood, so the tag has to be folded back onto the option list the user
 * would have been offered.
 */
const MOOD_TAG_LOOKUP =
    (() => {
        const lookup = new Map();

        for (const [
            moodId,
            aliases,
        ] of Object.entries(
            MOOD_ALIASES
        )) {
            for (const alias of aliases) {
                const normalized =
                    normalizeTag(alias);

                if (
                    normalized &&
                    !lookup.has(normalized)
                ) {
                    lookup.set(
                        normalized,
                        moodId
                    );
                }
            }
        }

        return lookup;
    })();

/*
 * Picks the one mood that best describes a set. A tag that is already a
 * mood id wins, then a tag that is an alias of one, then the raw tag so
 * the field is never left empty when the catalog has something to say.
 */
function resolveMoodTag(
    tags = []
) {
    const normalizedTags =
        (Array.isArray(tags)
            ? tags
            : []
        )
            .map(normalizeTag)
            .filter(Boolean);

    if (normalizedTags.length === 0) {
        return null;
    }

    const canonical =
        normalizedTags.find(
            (tag) =>
                getMood(tag) !== null
        );

    if (canonical) {
        return canonical;
    }

    const aliased =
        normalizedTags.find(
            (tag) =>
                MOOD_TAG_LOOKUP.has(tag)
        );

    if (aliased) {
        return MOOD_TAG_LOOKUP.get(aliased);
    }

    return normalizedTags[0];
}

/*
 * The catalog lists colors most-representative first, so the first tag
 * stands in for the set. A filter the user actually chose always wins —
 * this only fills the gap they left.
 */
function resolveColorTag(
    tags = []
) {
    const normalizedTags =
        (Array.isArray(tags)
            ? tags
            : []
        )
            .map(normalizeTag)
            .filter(Boolean);

    return normalizedTags[0] || null;
}

/*
 * What the generated profile actually looked like, as opposed to what
 * was asked for. Saved aesthetics keep these so a run with no filters
 * still records a mood and a color instead of two blanks.
 */
function resolveProfileSetAttributes(
    profileSet,
    filters = {}
) {
    const metadata =
        profileSet?.metadata ||
        profileSet ||
        {};

    return {
        color:
            normalizeTag(filters.color) ||
            resolveColorTag(metadata.colors),

        mood:
            normalizeTag(filters.mood) ||
            resolveMoodTag(metadata.moods),
    };
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
    premiumUnlocked = false,
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

    const matchingSets = assetCatalog.filter(
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

    return getUsableCatalogSets(
        matchingSets,
        premiumUnlocked
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
        /*
         * The pool is empty. Either the aesthetic genuinely has no
         * sets, or every matching set was filtered out because it is
         * premium and this user has not unlocked it. Those deserve
         * different replies, so compare against the unfiltered
         * catalog rather than assuming the library is empty.
         */
        const premiumOnly =
            filters.premiumUnlocked !== true &&
            filterCatalog(filters).length === 0 &&
            filterCatalog({
                ...filters,
                premiumUnlocked: true,
            }).length > 0;

        throw new Error(
            premiumOnly
                ? PREMIUM_SETS_ONLY_ERROR
                : "No profile sets match the requested aesthetic filters."
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
    PREMIUM_SETS_ONLY_ERROR,
    isPremiumOnlyError,
    getUsableCatalogSets,


    getCatalogSetsByAesthetic,
    getCatalogSetsByColor,
    getCatalogSetsByMood,
    filterCatalog,
    getMatchingProfileSets,
    getRandomMatchingProfileSet,
    resolveProfileSetAttributes,
};