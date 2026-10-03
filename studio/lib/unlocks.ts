import {
    ExpectedError,
} from "./apiError";

import {
    query,
    withTransaction,
} from "./database";

import {
    getFeatureConfig,
    getCrownUnlockTerms,
    getPeriodKey,
    isFeatureId,
    type FeatureId,
} from "./features";

/**
 * Features bought with Crowns instead of a subscription.
 *
 * Two shapes, because the two kinds of feature need different things:
 *
 *  - a BOOST adds `allowance` uses to a metered feature for one
 *    reset window. It is keyed by `periodKey`, so it stops applying
 *    by itself the moment the window rolls over — nothing has to
 *    expire it, and a boost bought in March can never leak into April.
 *
 *  - a TIMED unlock opens a gated feature until `expiresAt`. Buying
 *    again while it is still open extends the deadline rather than
 *    starting a second row.
 *
 * Both are written in the same transaction as the Crown spend, so a
 * charge can never land without the unlock and an unlock can never
 * exist without the charge.
 */

/**
 * `periodKey` for gated unlocks. They are not windowed, but the
 * unique index needs a value so that repeat purchases extend one row
 * rather than buying a second copy of the same access.
 */
const TIMED_PERIOD_KEY = "TIMED";

export type CrownUnlockRow = {
    id: string;
    feature: string;
    kind: "BOOST" | "TIMED";

    periodKey: string;
    allowance: number | null;
    expiresAt: Date | null;

    createdAt: Date;
};

export type ActiveUnlocks = {
    /**
     * Extra uses granted for the current window, or 0.
     */
    boost: number;

    /**
     * When a gated unlock stops applying, or null when there is none.
     */
    expiresAt: Date | null;
};

const EMPTY: ActiveUnlocks = {
    boost: 0,
    expiresAt: null,
};

/**
 * The unlock state that matters right now for one feature.
 *
 * Called on every entitlement check, so it is one indexed query and
 * does no joins beyond the user lookup.
 */
export async function getActiveUnlocks(
    discordId: string,
    feature: FeatureId,
    periodKey: string
): Promise<ActiveUnlocks> {
    const result =
        await query<{
            kind: "BOOST" | "TIMED";
            allowance: number | null;
            expiresAt: Date | null;
        }>(
            `
            SELECT
                cu.kind,
                cu.allowance,
                cu."expiresAt"

            FROM "CrownUnlock" cu
            INNER JOIN "User" u
                ON u.id = cu."userId"

            WHERE
                u."discordId" = $1
                AND cu.feature = $2

                AND (
                    /* a boost only counts inside its own window */
                    (
                        cu.kind = 'BOOST'
                        AND cu."periodKey" = $3
                    )

                    /* a timed unlock only counts before it lapses */
                    OR (
                        cu.kind = 'TIMED'
                        AND cu."expiresAt" > NOW()
                    )
                )
            `,
            [
                discordId,
                feature,
                periodKey,
            ]
        );

    if (!result.rowCount) {
        return EMPTY;
    }

    let boost = 0;
    let expiresAt: Date | null = null;

    for (const row of result.rows) {
        if (row.kind === "BOOST") {
            boost += row.allowance ?? 0;
        } else if (
            row.expiresAt &&
            (!expiresAt ||
                row.expiresAt > expiresAt)
        ) {
            expiresAt = row.expiresAt;
        }
    }

    return { boost, expiresAt };
}

export type UnlockPurchaseResult =
    | {
        ok: true;
        unlock: CrownUnlockRow;
        balance: number;
    }
    | {
        ok: false;
        reason:
            | "not_unlockable"
            | "insufficient"
            | "already_unlocked";

        balance: number;
    };

/**
 * Buys an unlock.
 *
 * The "User" row lock from `spendCrowns` is taken first, then the
 * spend and the unlock insert share one transaction. The idempotency
 * key is derived from the terms rather than generated per request, so
 * a double-clicked button replays into `already_unlocked` instead of
 * charging twice.
 */
export async function purchaseUnlock(
    discordId: string,
    feature: FeatureId
): Promise<UnlockPurchaseResult> {
    const terms =
        getCrownUnlockTerms(
            feature
        );

    if (!terms) {
        throw new ExpectedError(
            "That feature cannot be unlocked with Crowns."
        );
    }

    const config =
        getFeatureConfig(
            feature
        );

    /*
     * `terms.kind` mirrors `config.kind`: a BOOST can only come from
     * a metered feature, so the narrowing below is safe.
     */
    const periodKey =
        terms.kind === "BOOST" &&
        config.kind === "metered"
            ? getPeriodKey(
                config.resetPeriod
            )
            : TIMED_PERIOD_KEY;

    /*
     * Repeat purchases are allowed and stack, so the key cannot be
     * derived from the window — a second deliberate top-up in the
     * same month must charge. A coarse minute bucket instead absorbs
     * a double-clicked button and a dropped-response retry, which is
     * what an idempotency key is for.
     */
    const idempotencyKey =
        `unlock:${feature}:${Math.floor(
            Date.now() / 60000
        )}`;

    return withTransaction(
        async (client) => {
            const user =
                await client.query<{
                    id: string;
                }>(
                    `
                    SELECT id
                    FROM "User"
                    WHERE "discordId" = $1
                    FOR UPDATE
                    `,
                    [
                        discordId,
                    ]
                );

            const userId =
                user.rows[0]?.id;

            if (!userId) {
                return {
                    ok: false as const,

                    reason:
                        "insufficient" as const,

                    balance: 0,
                };
            }

            const balanceResult =
                await client.query<{
                    balance: string | number | null;
                }>(
                    `
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        )::bigint AS balance
                    FROM "CrownTransaction"
                    WHERE "userId" = $1
                    `,
                    [
                        userId,
                    ]
                );

            const balance = Number(
                balanceResult.rows[0]?.balance ?? 0
            );

            const existing =
                await client.query<{
                    id: string;
                }>(
                    `
                    SELECT id
                    FROM "CrownTransaction"
                    WHERE
                        "userId" = $1
                        AND "idempotencyKey" = $2
                    LIMIT 1
                    `,
                    [
                        userId,
                        idempotencyKey,
                    ]
                );

            if (existing.rowCount) {
                return {
                    ok: false as const,

                    reason:
                        "already_unlocked" as const,

                    balance,
                };
            }

            if (balance < terms.cost) {
                return {
                    ok: false as const,

                    reason:
                        "insufficient" as const,

                    balance,
                };
            }

            const transaction =
                await client.query<{
                    id: string;
                }>(
                    `
                    INSERT INTO "CrownTransaction" (
                        id,
                        "userId",
                        type,
                        amount,
                        reason,
                        source,
                        "idempotencyKey",
                        "createdAt"
                    )
                    VALUES (
                        $1,
                        $2,
                        'SPEND',
                        $3,
                        $4,
                        $5,
                        $6,
                        NOW()
                    )
                    RETURNING id
                    `,
                    [
                        crypto.randomUUID(),
                        userId,
                        -terms.cost,
                        `Unlocked ${config.label} with Crowns`,
                        `unlock:${feature}`,
                        idempotencyKey,
                    ]
                );

            const unlock =
                await client.query<CrownUnlockRow>(
                    terms.kind === "BOOST"
                        ? `
                        INSERT INTO "CrownUnlock" (
                            id,
                            "userId",
                            feature,
                            kind,
                            "periodKey",
                            allowance,
                            "transactionId",
                            "createdAt",
                            "updatedAt"
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            'BOOST',
                            $4,
                            $5,
                            $6,
                            NOW(),
                            NOW()
                        )
                        ON CONFLICT (
                            "userId",
                            "feature",
                            "periodKey"
                        )
                        DO UPDATE SET
                            allowance =
                                COALESCE(
                                    "CrownUnlock"."allowance",
                                    0
                                ) + EXCLUDED.allowance,
                            "transactionId" =
                                EXCLUDED."transactionId",
                            "updatedAt" = NOW()
                        RETURNING
                            id,
                            feature,
                            kind,
                            "periodKey",
                            allowance,
                            "expiresAt",
                            "createdAt"
                        `
                        : `
                        INSERT INTO "CrownUnlock" (
                            id,
                            "userId",
                            feature,
                            kind,
                            "periodKey",
                            "expiresAt",
                            "transactionId",
                            "createdAt",
                            "updatedAt"
                        )
                        VALUES (
                            $1,
                            $2,
                            $3,
                            'TIMED',
                            $6,
                            NOW() + ($4 || ' days')::interval,
                            $5,
                            NOW(),
                            NOW()
                        )
                        ON CONFLICT (
                            "userId",
                            "feature",
                            "periodKey"
                        )
                        DO UPDATE SET
                            "expiresAt" = GREATEST(
                                "CrownUnlock"."expiresAt",
                                NOW()
                            ) + ($4 || ' days')::interval,
                            "transactionId" =
                                EXCLUDED."transactionId",
                            "updatedAt" = NOW()
                        RETURNING
                            id,
                            feature,
                            kind,
                            "periodKey",
                            allowance,
                            "expiresAt",
                            "createdAt"
                        `,
                    terms.kind === "BOOST"
                        ? [
                            crypto.randomUUID(),
                            userId,
                            feature,
                            periodKey,
                            terms.allowance,
                            transaction.rows[0].id,
                        ]
                        : [
                            crypto.randomUUID(),
                            userId,
                            feature,
                            terms.days,
                            transaction.rows[0].id,
                            periodKey,
                        ]
                );

            return {
                ok: true as const,

                unlock:
                    unlock.rows[0],

                balance:
                    balance -
                    terms.cost,
            };
        }
    );
}

export type UnlockSummaryRow = {
    id: string;
    feature: string;
    kind: "BOOST" | "TIMED";

    periodKey: string;
    allowance: number | null;
    expiresAt: Date | null;

    createdAt: Date;
};

/**
 * Live unlocks for the Crowns page.
 *
 * A timed unlock is live while `expiresAt` is in the future, which
 * SQL can answer. A boost is live while its `periodKey` is still the
 * current window, which only `features.ts` knows — the window depends
 * on the feature's own reset period — so that half is filtered here.
 * Rows for features that were later removed from the registry are
 * dropped rather than rendered with a made-up label.
 */
export async function getUnlockSummary(
    discordId: string
): Promise<UnlockSummaryRow[]> {
    const result =
        await query<UnlockSummaryRow>(
            `
            SELECT
                cu.id,
                cu.feature,
                cu.kind,
                cu."periodKey",
                cu.allowance,
                cu."expiresAt",
                cu."createdAt"

            FROM "CrownUnlock" cu
            INNER JOIN "User" u
                ON u.id = cu."userId"

            WHERE
                u."discordId" = $1
                AND (
                    cu."expiresAt" IS NULL
                    OR cu."expiresAt" > NOW()
                )

            ORDER BY cu."createdAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows.filter((row) => {
        if (!isFeatureId(row.feature)) {
            return false;
        }

        if (row.kind === "TIMED") {
            return true;
        }

        const config =
            getFeatureConfig(
                row.feature
            );

        return (
            config.kind === "metered" &&
            row.periodKey ===
                getPeriodKey(
                    config.resetPeriod
                )
        );
    });
}
