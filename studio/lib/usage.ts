import {
    query,
} from "./database";

import {
    getPeriodKey,
    getPeriodStart,
    type FeatureId,
    type ResetPeriod,
    type UsageSource,
} from "./features";

/**
 * Two kinds of usage, and the difference matters:
 *
 *   "derived" — the feature already writes a row we can count
 *               (collections, saved aesthetics, shared posts).
 *               Always exact, needs no bookkeeping, and survives a
 *               user deleting the thing they created.
 *
 *   "ledger"  — the feature is stateless (an AI generation returns
 *               a response and persists nothing), so consumption is
 *               recorded explicitly in "FeatureUsage".
 *
 * Prefer "derived" whenever a backing table exists. A ledger that
 * nobody writes to silently reports zero and hands everyone a free
 * allowance, which is exactly the failure mode this file is written
 * to avoid.
 */

type DerivedSource = {
    /**
     * Table already keyed to the user, aliased as `src`.
     */
    table: string;

    /**
     * Column used for reset windows. Null means the feature never
     * resets, so no time filter is applied.
     */
    timestamp: string | null;
};

const DERIVED_SOURCES: Partial<
    Record<FeatureId, DerivedSource>
> = {
    COLLECTION_LIMIT: {
        table: '"Collection"',
        timestamp: '"createdAt"',
    },

    SAVED_PROFILE_LIMIT: {
        table: '"SavedAesthetic"',
        timestamp: '"createdAt"',
    },

    COMMUNITY_PUBLISH_LIMIT: {
        table: '"SharedPost"',
        timestamp: '"createdAt"',
    },
};

export type FeatureUsage = {
    feature: FeatureId;

    used: number;

    /**
     * False when no code path records this feature yet, so the UI
     * can hide the counter instead of lying with "0 of N".
     */
    tracked: boolean;
};

/**
 * Ledger features that are actually wired up. A ledger feature that
 * nothing writes to would report a convincing but false zero, so it
 * must be listed here before it can claim to be tracked.
 */
const RECORDED_FEATURES = new Set<FeatureId>([
    "AI_GENERATION_LIMIT",
]);

/**
 * How much of a feature has been consumed in the current window.
 *
 * Safe to call for any feature: an unmetered or unconfigured feature
 * reports 0 rather than throwing, so gating code can stay uniform.
 */
export async function peekUsage(
    discordId: string,
    feature: FeatureId,
    options: {
        usageSource: UsageSource;
        resetPeriod: ResetPeriod;
    }
): Promise<FeatureUsage> {
    if (
        options.usageSource ===
        "derived"
    ) {
        return peekDerivedUsage(
            discordId,
            feature,
            options.resetPeriod
        );
    }

    return peekLedgerUsage(
        discordId,
        feature,
        options.resetPeriod
    );
}

async function peekDerivedUsage(
    discordId: string,
    feature: FeatureId,
    resetPeriod: ResetPeriod
): Promise<FeatureUsage> {
    const source =
        DERIVED_SOURCES[
            feature
        ];

    if (!source) {
        return {
            feature,
            used: 0,
            tracked: false,
        };
    }

    const conditions = [
        'src."userId" = u.id',
        'u."discordId" = $1',
    ];

    const values: unknown[] = [
        discordId,
    ];

    const periodStart =
        source.timestamp
            ? getPeriodStart(
                resetPeriod
            )
            : null;

    if (
        source.timestamp &&
        periodStart
    ) {
        values.push(
            periodStart
        );

        conditions.push(
            `src.${source.timestamp} >= $${values.length}`
        );
    }

    const result =
        await query<{
            count: string | number;
        }>(
            `
            SELECT COUNT(*)::int AS count
            FROM ${source.table} src
            INNER JOIN "User" u
                ON u.id = src."userId"
            WHERE
                ${conditions.join(
                    " AND "
                )}
            `,
            values
        );

    return {
        feature,

        used: Number(
            result.rows[0]
                ?.count ?? 0
        ),

        tracked: true,
    };
}

async function peekLedgerUsage(
    discordId: string,
    feature: FeatureId,
    resetPeriod: ResetPeriod
): Promise<FeatureUsage> {
    const result =
        await query<{
            used: number;
        }>(
            `
            SELECT fu.used
            FROM "FeatureUsage" fu
            INNER JOIN "User" u
                ON u.id = fu."userId"
            WHERE
                u."discordId" = $1
                AND fu.feature = $2
                AND fu."periodKey" = $3
            LIMIT 1
            `,
            [
                discordId,
                feature,
                getPeriodKey(
                    resetPeriod
                ),
            ]
        );

    return {
        feature,

        used:
            result.rows[0]?.used ??
            0,

        tracked:
            RECORDED_FEATURES.has(
                feature
            ),
    };
}

/**
 * Records one consumption of a ledger-backed feature.
 *
 * Uses an upsert so the first write in a window creates the row and
 * later writes increment it. The counter is allowed to exceed the
 * plan ceiling: the gate is checked before the operation runs, and a
 * truthful overshoot is more useful than a clamped number that would
 * look wrong if the user later upgrades.
 *
 * Derived features are a no-op — their usage is already implied by
 * the row the caller just inserted.
 */
export async function recordUsage(
    discordId: string,
    feature: FeatureId,
    options: {
        usageSource: UsageSource;
        resetPeriod: ResetPeriod;

        amount?: number;
    }
): Promise<number> {
    if (
        options.usageSource !==
        "ledger"
    ) {
        const current =
            await peekUsage(
                discordId,
                feature,
                {
                    usageSource:
                        options.usageSource,

                    resetPeriod:
                        options.resetPeriod,
                }
            );

        return current.used;
    }

    const result =
        await query<{
            used: number;
        }>(
            `
            INSERT INTO "FeatureUsage" (
                id,
                "userId",
                feature,
                "periodKey",
                used,
                "lastUsedAt",
                "createdAt",
                "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                $2,
                $3,
                $4,
                NOW(),
                NOW(),
                NOW()
            FROM "User" u
            WHERE u."discordId" = $1
            ON CONFLICT (
                "userId",
                feature,
                "periodKey"
            )
            DO UPDATE SET
                used = "FeatureUsage".used + $4,
                "lastUsedAt" = NOW(),
                "updatedAt" = NOW()
            RETURNING used
            `,
            [
                discordId,
                feature,
                getPeriodKey(
                    options.resetPeriod
                ),
                options.amount ?? 1,
            ]
        );

    return (
        result.rows[0]?.used ?? 0
    );
}

/**
 * Gives a consumption back, e.g. when the operation behind it
 * failed after the counter had already moved.
 */
export async function refundUsage(
    discordId: string,
    feature: FeatureId,
    options: {
        usageSource: UsageSource;
        resetPeriod: ResetPeriod;

        amount?: number;
    }
): Promise<void> {
    if (
        options.usageSource !==
        "ledger"
    ) {
        return;
    }

    await query(
        `
        UPDATE "FeatureUsage" fu
        SET
            used = GREATEST(0, fu.used - $4),
            "updatedAt" = NOW()
        FROM "User" u
        WHERE
            fu."userId" = u.id
            AND u."discordId" = $1
            AND fu.feature = $2
            AND fu."periodKey" = $3
        `,
        [
            discordId,
            feature,
            getPeriodKey(
                options.resetPeriod
            ),
            options.amount ?? 1,
        ]
    );
}

/**
 * Every ledger row for a user, for the usage page's history view.
 */
export type UsageLedgerRow = {
    feature: string;
    periodKey: string;
    used: number;
    lastUsedAt: Date;
};

export async function getUsageLedger(
    discordId: string
): Promise<UsageLedgerRow[]> {
    const result =
        await query<UsageLedgerRow>(
            `
            SELECT
                fu.feature,
                fu."periodKey",
                fu.used,
                fu."lastUsedAt"
            FROM "FeatureUsage" fu
            INNER JOIN "User" u
                ON u.id = fu."userId"
            WHERE u."discordId" = $1
            ORDER BY fu."lastUsedAt" DESC
            LIMIT 50
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}
