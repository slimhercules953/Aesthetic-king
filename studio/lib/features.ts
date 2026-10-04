export type Plan =
    | "FREE"
    | "PREMIUM";

export type ResetPeriod =
    | "daily"
    | "weekly"
    | "monthly"
    | "never";

/*
 * There used to be a PERSONAL_PACK_LIMIT entry here. Personal Packs were never
 * built, so nothing ever wrote the counter and the Usage page would have shown
 * a permanent 0/2 for a feature nobody can use. A limit that cannot be reached
 * is not a limit, it is a promise the product does not keep — so it lives here
 * as a note instead of in the registry. Add it back together with the feature
 * that increments it.
 */
export const FEATURE_IDS = [
    "COLLECTION_LIMIT",
    "SAVED_PROFILE_LIMIT",
    "AI_GENERATION_LIMIT",
    "COMPLETE_PROFILE_LIMIT",
    "COMMUNITY_PUBLISH_LIMIT",
    "IMAGE_TO_AESTHETIC",
    "PREMIUM_ASSETS",
    "ADVANCED_PROFILE_BUILDER",
    "ADVANCED_EXPORTS",
    "CREATOR_ANALYTICS",
] as const;

export type FeatureId =
    (typeof FEATURE_IDS)[number];

export type UsageSource =
    /**
     * Counted from "FeatureUsage" rows written by the app when the
     * action runs. Correct for actions with no durable row of their
     * own, e.g. AI generations.
     */
    | "ledger"

    /**
     * Counted live from the table the feature actually writes to,
     * e.g. collections for COLLECTION_LIMIT. Always accurate and
     * needs no extra bookkeeping, so it is preferred whenever such
     * a table exists.
     */
    | "derived";

type MeteredFeatureConfig = {
    kind: "metered";

    label: string;
    description: string;

    freeLimit: number;
    premiumLimit: number;

    resetPeriod: ResetPeriod;
    usageSource: UsageSource;

    crownUnlockAvailable: boolean;
    crownCost: number | null;

    /**
     * Extra uses a Crown purchase buys inside the current window.
     * Only read when `crownUnlockAvailable` is true.
     */
    crownUnlockBoost: number | null;
};

type GatedFeatureConfig = {
    kind: "gated";

    label: string;
    description: string;

    freeAllowed: boolean;

    crownUnlockAvailable: boolean;
    crownCost: number | null;

    /**
     * How many days a Crown purchase keeps a gated feature open.
     * Only read when `crownUnlockAvailable` is true.
     */
    crownUnlockDays: number | null;
};

export type FeatureConfig =
    | MeteredFeatureConfig
    | GatedFeatureConfig;

/**
 * The single source of truth for every Premium limit and Crown price.
 *
 * These numbers are product placeholders. Change them HERE, never at
 * the call site. Nothing outside this file should contain a limit.
 */
export const FEATURES = {
    COLLECTION_LIMIT: {
        kind: "metered",

        label: "Collections",
        description:
            "Collections you can build from saved aesthetics, palettes and assets.",

        freeLimit: 5,
        premiumLimit: 50,

        resetPeriod: "never",

        // Collections already have a table, so the count is always
        // exact and needs no separate bookkeeping.
        usageSource: "derived",

        crownUnlockAvailable: false,
        crownCost: null,
        crownUnlockBoost: null,
    },

    SAVED_PROFILE_LIMIT: {
        kind: "metered",

        label: "Saved Profiles",
        description:
            "Aesthetics saved to your Studio library.",

        freeLimit: 25,
        premiumLimit: 500,

        resetPeriod: "never",

        // Derived from "SavedAesthetic", which Studio already
        // writes on every save.
        usageSource: "derived",

        crownUnlockAvailable: false,
        crownCost: null,
        crownUnlockBoost: null,
    },

    AI_GENERATION_LIMIT: {
        kind: "metered",

        label: "AI Generations",
        description:
            "AI-generated aesthetics, bios, statuses, usernames and palettes.",

        freeLimit: 10,
        premiumLimit: 250,

        resetPeriod: "monthly",

        // Generation is stateless — the response is returned to the
        // client and nothing is persisted — so consumption has to be
        // recorded explicitly in FeatureUsage.
        usageSource: "ledger",

        crownUnlockAvailable: true,
        crownCost: 60,
        crownUnlockBoost: 10,
    },

    COMPLETE_PROFILE_LIMIT: {
        kind: "metered",

        label: "Complete My Profile",
        description:
            "One-shot generation of a full coordinated profile.",

        freeLimit: 2,
        premiumLimit: 100,

        resetPeriod: "monthly",

        // The response is returned to the client and nothing is
        // persisted unless the user saves, so consumption is recorded
        // explicitly in FeatureUsage.
        usageSource: "ledger",

        crownUnlockAvailable: true,
        crownCost: 200,
        crownUnlockBoost: 5,
    },

    COMMUNITY_PUBLISH_LIMIT: {
        kind: "metered",

        label: "Community Publications",
        description:
            "Posts pushed to the Discover feed.",

        freeLimit: 10,
        premiumLimit: 100,

        resetPeriod: "weekly",

        // Derived from "SharedPost".createdAt inside the current
        // weekly window.
        usageSource: "derived",

        crownUnlockAvailable: false,
        crownCost: null,
        crownUnlockBoost: null,
    },

    IMAGE_TO_AESTHETIC: {
        kind: "gated",

        label: "Image-to-Aesthetic",
        description:
            "Upload an image and have Aesthetic King read its palette, aesthetic and mood.",

        freeAllowed: false,

        crownUnlockAvailable: true,
        crownCost: 1000,
        crownUnlockDays: 30,
    },

    PREMIUM_ASSETS: {
        kind: "gated",

        label: "Premium Assets",
        description:
            "The premium PFP, banner and profile set library.",

        freeAllowed: false,

        crownUnlockAvailable: true,
        crownCost: 800,
        crownUnlockDays: 30,
    },

    ADVANCED_PROFILE_BUILDER: {
        kind: "gated",

        label: "Advanced Profile Builder",
        description:
            "Advanced editing, AI recommendations and saved versions.",

        freeAllowed: false,

        crownUnlockAvailable: false,
        crownCost: null,
        crownUnlockDays: null,
    },

    ADVANCED_EXPORTS: {
        kind: "gated",

        label: "Advanced Exports",
        description:
            "High-resolution and bulk export options.",

        freeAllowed: false,

        crownUnlockAvailable: false,
        crownCost: null,
        crownUnlockDays: null,
    },

    CREATOR_ANALYTICS: {
        kind: "gated",

        label: "Creator Analytics",
        description:
            "Deeper statistics on how your published work performs.",

        freeAllowed: false,

        crownUnlockAvailable: false,
        crownCost: null,
        crownUnlockDays: null,
    },
} satisfies Record<
    FeatureId,
    FeatureConfig
>;

export function isFeatureId(
    value: unknown
): value is FeatureId {
    return (
        typeof value === "string" &&
        (
            FEATURE_IDS as readonly string[]
        ).includes(
            value
        )
    );
}

export function getFeatureConfig(
    feature: FeatureId
): FeatureConfig {
    return FEATURES[
        feature
    ];
}

export function getLimitForPlan(
    feature: FeatureId,
    plan: Plan
): number | null {
    const config =
        FEATURES[
            feature
        ];

    if (
        config.kind === "gated"
    ) {
        if (
            plan === "PREMIUM"
        ) {
            return 1;
        }

        return config.freeAllowed
            ? 1
            : 0;
    }

    return plan === "PREMIUM"
        ? config.premiumLimit
        : config.freeLimit;
}

function pad2(
    value: number
) {
    return String(
        value
    ).padStart(
        2,
        "0"
    );
}

/**
 * ISO-8601 week number, used to build weekly period keys.
 */
function isoWeek(
    date: Date
) {
    const target =
        new Date(
            Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate()
            )
        );

    const dayNumber =
        target.getUTCDay() ||
        7;

    target.setUTCDate(
        target.getUTCDate() +
            4 -
            dayNumber
    );

    const yearStart =
        new Date(
            Date.UTC(
                target.getUTCFullYear(),
                0,
                1
            )
        );

    const week =
        Math.ceil(
            (
                (
                    target.getTime() -
                    yearStart.getTime()
                ) /
                86400000 +
                1
            ) /
            7
        );

    return {
        year:
            target.getUTCFullYear(),
        week,
    };
}

/**
 * Stable identifier for the current billing window of a feature.
 *
 * "never" features use "ALL" so lifetime counters have one row.
 */
export function getPeriodKey(
    resetPeriod: ResetPeriod,
    now: Date =
        new Date()
): string {
    switch (
        resetPeriod
    ) {
        case "daily":
            return `${now.getUTCFullYear()}-${pad2(
                now.getUTCMonth() + 1
            )}-${pad2(
                now.getUTCDate()
            )}`;

        case "weekly": {
            const {
                year,
                week,
            } = isoWeek(
                now
            );

            return `${year}-W${pad2(
                week
            )}`;
        }

        case "monthly":
            return `${now.getUTCFullYear()}-${pad2(
                now.getUTCMonth() + 1
            )}`;

        case "never":
        default:
            return "ALL";
    }
}

/**
 * Start of the current window, or null for lifetime features.
 * Used to filter timestamped history until FeatureUsage exists.
 */
export function getPeriodStart(
    resetPeriod: ResetPeriod,
    now: Date =
        new Date()
): Date | null {
    switch (
        resetPeriod
    ) {
        case "daily":
            return new Date(
                Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    now.getUTCDate()
                )
            );

        case "weekly": {
            const start =
                new Date(
                    Date.UTC(
                        now.getUTCFullYear(),
                        now.getUTCMonth(),
                        now.getUTCDate()
                    )
                );

            const dayNumber =
                start.getUTCDay() ||
                7;

            start.setUTCDate(
                start.getUTCDate() -
                    (
                        dayNumber -
                        1
                    )
            );

            return start;
        }

        case "monthly":
            return new Date(
                Date.UTC(
                    now.getUTCFullYear(),
                    now.getUTCMonth(),
                    1
                )
            );

        case "never":
        default:
            return null;
    }
}

/**
 * When the current window rolls over, or null for lifetime features.
 */
export function getPeriodEnd(
    resetPeriod: ResetPeriod,
    now: Date =
        new Date()
): Date | null {
    const start =
        getPeriodStart(
            resetPeriod,
            now
        );

    if (!start) {
        return null;
    }

    const end =
        new Date(
            start
        );

    switch (
        resetPeriod
    ) {
        case "daily":
            end.setUTCDate(
                end.getUTCDate() +
                    1
            );
            break;

        case "weekly":
            end.setUTCDate(
                end.getUTCDate() +
                    7
            );
            break;

        case "monthly":
            end.setUTCMonth(
                end.getUTCMonth() +
                    1
            );
            break;
    }

    return end;
}

export type CrownUnlockTerms =
    | {
        kind: "BOOST";

        cost: number;

        /**
         * Extra uses granted inside the current window.
         */
        allowance: number;
    }
    | {
        kind: "TIMED";

        cost: number;

        /**
         * How long the gated feature stays open.
         */
        days: number;
    };

/**
 * What a Crown purchase actually buys for a feature, or null when
 * the feature cannot be bought. Derived from the registry so the
 * store, the button and the purchase route can never disagree about
 * a price.
 */
export function getCrownUnlockTerms(
    feature: FeatureId
): CrownUnlockTerms | null {
    const config =
        FEATURES[
            feature
        ];

    if (
        !config.crownUnlockAvailable ||
        config.crownCost === null
    ) {
        return null;
    }

    if (config.kind === "metered") {
        if (config.crownUnlockBoost === null) {
            return null;
        }

        return {
            kind: "BOOST",
            cost: config.crownCost,
            allowance: config.crownUnlockBoost,
        };
    }

    if (config.crownUnlockDays === null) {
        return null;
    }

    return {
        kind: "TIMED",
        cost: config.crownCost,
        days: config.crownUnlockDays,
    };
}
