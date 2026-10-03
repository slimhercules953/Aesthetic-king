import {
    ExpectedError,
} from "./apiError";

import {
    query,
    withTransaction,
} from "./database";

/**
 * Crowns are an append-only ledger.
 *
 * The balance is `SUM(amount)` over "CrownTransaction" and is never
 * stored in a column of its own. That costs an aggregate per read and
 * buys two things that matter for a currency: the history can never
 * disagree with the number, and a bug is always reconstructible from
 * the rows rather than lost to an overwritten balance.
 *
 * Every mutation goes through `withTransaction` and takes a row lock
 * on "User" first. Without that lock two concurrent spends can both
 * read a sufficient balance and both commit, overdrawing the account.
 */

export type CrownTransactionType =
    | "EARN"
    | "SPEND"
    | "ADJUSTMENT"
    | "REFUND";

export type CrownTransactionRow = {
    id: string;
    type: CrownTransactionType;
    amount: number;

    reason: string;
    source: string | null;

    createdAt: Date;
};

export type CrownBalance = {
    balance: number;

    earned: number;
    spent: number;
};

export async function getCrownBalance(
    discordId: string
): Promise<CrownBalance> {
    const result =
        await query<{
            balance: string | number | null;
            earned: string | number | null;
            spent: string | number | null;
        }>(
            `
            SELECT
                COALESCE(SUM(ct.amount), 0)::bigint AS balance,

                COALESCE(
                    SUM(
                        CASE
                            WHEN ct.amount > 0
                            THEN ct.amount
                            ELSE 0
                        END
                    ),
                    0
                )::bigint AS earned,

                COALESCE(
                    SUM(
                        CASE
                            WHEN ct.amount < 0
                            THEN -ct.amount
                            ELSE 0
                        END
                    ),
                    0
                )::bigint AS spent

            FROM "CrownTransaction" ct
            INNER JOIN "User" u
                ON u.id = ct."userId"
            WHERE u."discordId" = $1
            `,
            [
                discordId,
            ]
        );

    const row =
        result.rows[0];

    return {
        balance: Number(
            row?.balance ?? 0
        ),

        earned: Number(
            row?.earned ?? 0
        ),

        spent: Number(
            row?.spent ?? 0
        ),
    };
}

export async function getCrownHistory(
    discordId: string,
    limit = 25
): Promise<CrownTransactionRow[]> {
    const result =
        await query<CrownTransactionRow>(
            `
            SELECT
                ct.id,
                ct.type,
                ct.amount,
                ct.reason,
                ct.source,
                ct."createdAt"

            FROM "CrownTransaction" ct
            INNER JOIN "User" u
                ON u.id = ct."userId"
            WHERE u."discordId" = $1
            ORDER BY ct."createdAt" DESC
            LIMIT $2
            `,
            [
                discordId,
                limit,
            ]
        );

    return result.rows;
}

/**
 * Adds crowns. Positive `amount` only — a negative credit is a
 * spend and belongs to `spendCrowns`, which enforces the balance.
 */
export async function creditCrowns(
    discordId: string,
    input: {
        amount: number;
        type: Extract<
            CrownTransactionType,
            "EARN" | "ADJUSTMENT" | "REFUND"
        >;

        reason: string;
        source?: string | null;

        idempotencyKey?: string | null;
    }
): Promise<CrownTransactionRow | null> {
    if (
        !Number.isInteger(
            input.amount
        ) ||
        input.amount <= 0
    ) {
        throw new ExpectedError(
            "Crown credits must be a positive integer."
        );
    }

    return insertTransaction(
        discordId,
        {
            ...input,
            amount:
                input.amount,
        }
    );
}

export type SpendResult =
    | {
        ok: true;
        transaction:
            CrownTransactionRow;

        balance: number;
    }
    | {
        ok: false;
        reason:
            | "insufficient"
            | "duplicate";

        balance: number;
    };

/**
 * Atomically spends crowns.
 *
 * The "User" row lock serialises concurrent spends for the same
 * account, so the balance read below is still true when the ledger
 * row is written. `idempotencyKey` makes a retried request a no-op
 * instead of a double charge.
 */
export async function spendCrowns(
    discordId: string,
    input: {
        amount: number;
        reason: string;
        source?: string | null;

        idempotencyKey?:
            | string
            | null;
    }
): Promise<SpendResult> {
    if (
        !Number.isInteger(
            input.amount
        ) ||
        input.amount <= 0
    ) {
        throw new ExpectedError(
            "Crown spends must be a positive integer."
        );
    }

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

            if (
                input.idempotencyKey
            ) {
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
                            input.idempotencyKey,
                        ]
                    );

                if (
                    existing.rowCount
                ) {
                    const balance =
                        await readBalance(
                            client,
                            userId
                        );

                    return {
                        ok: false as const,

                        reason:
                            "duplicate" as const,

                        balance,
                    };
                }
            }

            const balance =
                await readBalance(
                    client,
                    userId
                );

            if (
                balance <
                input.amount
            ) {
                return {
                    ok: false as const,

                    reason:
                        "insufficient" as const,

                    balance,
                };
            }

            const inserted =
                await client.query<CrownTransactionRow>(
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
                    RETURNING
                        id,
                        type,
                        amount,
                        reason,
                        source,
                        "createdAt"
                    `,
                    [
                        crypto.randomUUID(),
                        userId,
                        -input.amount,
                        input.reason,
                        input.source ??
                            null,
                        input.idempotencyKey ??
                            null,
                    ]
                );

            return {
                ok: true as const,

                transaction:
                    inserted.rows[0],

                balance:
                    balance -
                    input.amount,
            };
        }
    );
}

/**
 * Returns crowns previously spent, e.g. when a Crown-purchased
 * action failed. Recorded as a positive REFUND row rather than by
 * deleting the original spend, so the ledger stays truthful.
 */
export async function refundCrowns(
    discordId: string,
    input: {
        amount: number;
        reason: string;
        source?: string | null;

        idempotencyKey?:
            | string
            | null;
    }
): Promise<CrownTransactionRow | null> {
    return creditCrowns(
        discordId,
        {
            amount:
                input.amount,

            type:
                "REFUND",

            reason:
                input.reason,

            source:
                input.source,

            idempotencyKey:
                input.idempotencyKey,
        }
    );
}

async function readBalance(
    client: {
        query: (
            text: string,
            values?: unknown[]
        ) => Promise<{
            rows: Array<{
                balance:
                    | string
                    | number
                    | null;
            }>;
        }>;
    },
    userId: string
): Promise<number> {
    const result =
        await client.query(
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

    return Number(
        result.rows[0]?.balance ??
            0
    );
}

async function insertTransaction(
    discordId: string,
    input: {
        amount: number;
        type: CrownTransactionType;

        reason: string;
        source?: string | null;

        idempotencyKey?:
            | string
            | null;
    }
): Promise<CrownTransactionRow | null> {
    const result =
        await query<CrownTransactionRow>(
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
            SELECT
                $1,
                u.id,
                $2::"CrownTransactionType",
                $3,
                $4,
                $5,
                $6,
                NOW()
            FROM "User" u
            WHERE u."discordId" = $7
            RETURNING
                id,
                type,
                amount,
                reason,
                source,
                "createdAt"
            `,
            [
                crypto.randomUUID(),
                input.type,
                input.amount,
                input.reason,
                input.source ?? null,
                input.idempotencyKey ?? null,
                discordId,
            ]
        );

    return (
        result.rows[0] ?? null
    );
}
