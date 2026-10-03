const {
    prisma,
} = require("../database/prisma");

/**
 * Bot-side mirror of `studio/lib/featureAccess.ts`.
 *
 * The Studio owns the feature registry (`studio/lib/features.ts`) and
 * the rules that read it. This module deliberately does not copy the
 * registry — it answers the one question the bot has, "may this user
 * use this gated feature right now?", from the same two sources of
 * truth the Studio uses:
 *
 *   1. an active PREMIUM `Entitlement` (the plan), and
 *   2. an unexpired TIMED `CrownUnlock` for that feature.
 *
 * The plan is always derived from the entitlement table rather than
 * stored, so revocations, expiries and grandfathered grants reach the
 * bot the moment they reach the Studio. A user who has never signed
 * into Studio has no row and is therefore FREE — fail-closed, which is
 * the correct default for a paid feature.
 *
 * Only gated features are answered here. Asking about a metered
 * feature throws rather than reporting "allowed" for a limit the bot
 * has never counted.
 */

const GATED_FEATURES = new Set([
    "PREMIUM_ASSETS",
    "IMAGE_TO_AESTHETIC",
    "ADVANCED_PROFILE_BUILDER",
    "ADVANCED_EXPORTS",
    "CREATOR_ANALYTICS",
]);

/**
 * Personal plan, derived from live entitlements.
 */
async function getActivePlan(discordId) {
    if (!discordId) {
        throw new Error(
            "A Discord user ID is required."
        );
    }

    const now = new Date();

    const entitlement =
        await prisma.entitlement.findFirst({
            where: {
                user: {
                    discordId,
                },

                type: "PREMIUM",
                active: true,
                startsAt: { lte: now },

                OR: [
                    { endsAt: null },
                    { endsAt: { gt: now } },
                ],
            },

            select: {
                id: true,
            },
        });

    return entitlement
        ? "PREMIUM"
        : "FREE";
}

/**
 * When a Crown purchase of a gated feature lapses, or null when the
 * user holds no live unlock for it.
 */
async function getCrownUnlockExpiry(
    discordId,
    feature
) {
    if (!discordId) {
        throw new Error(
            "A Discord user ID is required."
        );
    }

    const unlock =
        await prisma.crownUnlock.findFirst({
            where: {
                user: {
                    discordId,
                },

                feature,
                kind: "TIMED",
                expiresAt: { gt: new Date() },
            },

            orderBy: {
                expiresAt: "desc",
            },

            select: {
                expiresAt: true,
            },
        });

    return unlock?.expiresAt ?? null;
}

/**
 * Whether a gated feature is open for this user right now.
 */
async function hasFeatureAccess(
    discordId,
    feature
) {
    if (!GATED_FEATURES.has(feature)) {
        throw new Error(
            `Feature "${feature}" is not a gated feature the bot can check.`
        );
    }

    const plan =
        await getActivePlan(discordId);

    if (plan === "PREMIUM") {
        return true;
    }

    const expiresAt =
        await getCrownUnlockExpiry(
            discordId,
            feature
        );

    return expiresAt !== null;
}

/**
 * Access to the premium PFP/banner profile sets.
 */
async function hasPremiumAssets(discordId) {
    return hasFeatureAccess(
        discordId,
        "PREMIUM_ASSETS"
    );
}

/**
 * `hasPremiumAssets` for interactive commands.
 *
 * Commands like `/profile` previously worked without a database, and
 * an outage should not take the free library down with it. On a lookup
 * failure this reports "not unlocked" — the user loses premium sets,
 * which is the smaller failure than serving paid content for free.
 */
async function resolvePremiumAssets(discordId) {
    try {
        return await hasPremiumAssets(discordId);
    } catch (error) {
        console.warn(
            "[entitlements] premium asset check failed, falling back to FREE:",
            error?.message || error
        );

        return false;
    }
}

module.exports = {
    GATED_FEATURES,

    getActivePlan,
    getCrownUnlockExpiry,
    hasFeatureAccess,
    hasPremiumAssets,
    resolvePremiumAssets,
};
