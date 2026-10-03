const {
    prisma,
} = require("../database/prisma");

const {
    getActivePlan,
} = require("./featureAccessService");

/**
 * Read-only premium status for the `/premium` command.
 *
 * The Studio is the only place Crowns are earned or spent, and the only
 * place unlocks are bought. The bot deliberately keeps no Crown logic of
 * its own; this module reads the same tables the Studio writes so that
 * `/premium` can tell a user where they actually stand without
 * duplicating any rules.
 *
 * A user who has never signed into Studio has no `User` row, so they
 * read as FREE with zero Crowns and no unlocks. That is the correct
 * answer, not a bug: there is nothing to report until they exist.
 */

/**
 * Human names for the features the bot gates.
 *
 * `studio/lib/features.ts` owns the registry, including Crown prices and
 * the metered/gated distinction. Only the gated subset is listed here,
 * because those are the only unlocks the bot can meaningfully show —
 * and no prices are repeated, so there is no second copy of a number to
 * forget to update.
 */
const GATED_FEATURE_LABELS = {
    PREMIUM_ASSETS: "Premium Assets",
    IMAGE_TO_AESTHETIC: "Image-to-Aesthetic",
    ADVANCED_PROFILE_BUILDER: "Advanced Profile Builder",
    ADVANCED_EXPORTS: "Advanced Exports",
    CREATOR_ANALYTICS: "Creator Analytics",
};

async function getCrownTotals(discordId) {
    const [
        balance,
        earned,
        spent,
    ] = await Promise.all([
        prisma.crownTransaction.aggregate({
            where: {
                user: {
                    discordId,
                },
            },

            _sum: {
                amount: true,
            },
        }),

        prisma.crownTransaction.aggregate({
            where: {
                user: {
                    discordId,
                },

                amount: { gt: 0 },
            },

            _sum: {
                amount: true,
            },
        }),

        prisma.crownTransaction.aggregate({
            where: {
                user: {
                    discordId,
                },

                amount: { lt: 0 },
            },

            _sum: {
                amount: true,
            },
        }),
    ]);

    return {
        balance: balance._sum.amount ?? 0,
        earned: earned._sum.amount ?? 0,
        spent: -(spent._sum.amount ?? 0),
    };
}

/**
 * Timed unlocks the user is currently paying for with Crowns.
 *
 * BOOST unlocks are excluded: they are monthly allowance top-ups for
 * metered features, which the bot does not count, so listing them here
 * would promise something the bot cannot honour.
 */
async function getActiveUnlocks(discordId) {
    const unlocks =
        await prisma.crownUnlock.findMany({
            where: {
                user: {
                    discordId,
                },

                kind: "TIMED",
                expiresAt: { gt: new Date() },
            },

            orderBy: {
                expiresAt: "asc",
            },

            select: {
                feature: true,
                expiresAt: true,
            },
        });

    const byFeature = new Map();

    for (const unlock of unlocks) {
        // Two rows for one feature mean the user stacked purchases; the
        // later expiry is the one that actually matters.
        const existing =
            byFeature.get(unlock.feature);

        if (
            !existing ||
            unlock.expiresAt > existing.expiresAt
        ) {
            byFeature.set(unlock.feature, {
                feature: unlock.feature,
                label:
                    GATED_FEATURE_LABELS[
                        unlock.feature
                    ] ?? unlock.feature,
                expiresAt: unlock.expiresAt,
            });
        }
    }

    return [...byFeature.values()].sort(
        (a, b) =>
            a.expiresAt.getTime() -
            b.expiresAt.getTime()
    );
}

async function getPremiumStatus(discordId) {
    if (!discordId) {
        throw new Error(
            "A Discord user ID is required."
        );
    }

    const [
        plan,
        crowns,
        unlocks,
    ] = await Promise.all([
        getActivePlan(discordId),
        getCrownTotals(discordId),
        getActiveUnlocks(discordId),
    ]);

    return {
        plan,
        crowns,
        unlocks,
    };
}

module.exports = {
    GATED_FEATURE_LABELS,
    getPremiumStatus,
};
