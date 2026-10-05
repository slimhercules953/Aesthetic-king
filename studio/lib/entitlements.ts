import {
    query,
    withTransaction,
} from "./database";

import type {
    Plan,
} from "./features";

import {
    createNotificationForDiscordUser,
} from "./notifications";

export type EntitlementType =
    | "PREMIUM"
    | "SERVER_PREMIUM";

export type EntitlementRecord = {
    id: string;
    type: EntitlementType;
    source: string | null;
    active: boolean;
    startsAt: Date;
    endsAt: Date | null;

    /**
     * Store SKU this came from, or null for staff/trial/dev grants.
     */
    skuId: string | null;

    /**
     * The provider's own entitlement ID. Used to recognize a replayed
     * webhook and to revoke the exact grant a refund applies to.
     */
    externalEntitlementId: string | null;
};

/**
 * An entitlement is live only while it is flagged active AND the
 * current instant sits inside its startsAt/endsAt window.
 */
const ACTIVE_PREDICATE = `
    e."active" = true
    AND e."startsAt" <= NOW()
    AND (
        e."endsAt" IS NULL
        OR e."endsAt" > NOW()
    )
`;

/**
 * Shared projection so every read returns the same shape as
 * `EntitlementRecord`.
 */
const ENTITLEMENT_COLUMNS = `
    e.id,
    e.type,
    e.source,
    e."active",
    e."skuId",
    e."externalEntitlementId",
    e."startsAt",
    e."endsAt"
`;

/**
 * Selects the live PREMIUM row to present when more than one is live.
 *
 * Normally there is only one (see `grantEntitlement`). The exception is
 * an account that holds a permanent grant and later buys a period: the
 * permanent row is kept, and it is the row that describes the account,
 * because "never expires" is the more accurate answer than the end date
 * of a purchase that was never going to be the account's expiry.
 */
function pickPrimaryPremium(
    entitlements: EntitlementRecord[]
): EntitlementRecord | null {
    return (
        entitlements.find(
            (entitlement) =>
                entitlement.type === "PREMIUM" &&
                entitlement.endsAt === null
        ) ??
        entitlements.find(
            (entitlement) =>
                entitlement.type === "PREMIUM"
        ) ??
        null
    );
}

export async function getActiveEntitlements(
    discordId: string
): Promise<EntitlementRecord[]> {
    const result =
        await query<EntitlementRecord>(
            `
            SELECT
                ${ENTITLEMENT_COLUMNS}
            FROM "Entitlement" e
            INNER JOIN "User" u
                ON u.id = e."userId"
            WHERE
                u."discordId" = $1
                AND ${ACTIVE_PREDICATE}
            ORDER BY
                e."startsAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}

/**
 * Personal plan, derived from live entitlements.
 *
 * There is deliberately no stored "plan" column: the plan is always
 * whatever the entitlement table says right now, so revocations,
 * expiries and promotions take effect immediately.
 */
export async function getActivePlan(
    discordId: string
): Promise<Plan> {
    const result =
        await query<{
            exists: boolean;
        }>(
            `
            SELECT EXISTS (
                SELECT 1
                FROM "Entitlement" e
                INNER JOIN "User" u
                    ON u.id = e."userId"
                WHERE
                    u."discordId" = $1
                    AND e.type = 'PREMIUM'
                    AND ${ACTIVE_PREDICATE}
            ) AS "exists"
            `,
            [
                discordId,
            ]
        );

    return result.rows[0]
        ?.exists
        ? "PREMIUM"
        : "FREE";
}

export async function hasEntitlement(
    discordId: string,
    type: EntitlementType
): Promise<boolean> {
    const result =
        await query<{
            exists: boolean;
        }>(
            `
            SELECT EXISTS (
                SELECT 1
                FROM "Entitlement" e
                INNER JOIN "User" u
                    ON u.id = e."userId"
                WHERE
                    u."discordId" = $1
                    AND e.type = $2::"EntitlementType"
                    AND ${ACTIVE_PREDICATE}
            ) AS "exists"
            `,
            [
                discordId,
                type,
            ]
        );

    return Boolean(
        result.rows[0]
            ?.exists
    );
}

export type EntitlementSummary = {
    plan: Plan;

    /**
     * The live PREMIUM row driving the plan, if any.
     */
    premium: EntitlementRecord | null;

    /**
     * When Premium lapses, or null when it is permanent / absent.
     */
    renewsAt: Date | null;

    /**
     * True when the user is Premium through something other than a
     * paid subscription (trial, staff grant, gift, promotion).
     */
    isPromotional: boolean;
};

/**
 * Sources that represent a real paid subscription. Everything else
 * is treated as a grant so the UI can label it honestly.
 */
const PAID_SOURCES = new Set([
    "stripe",
    "payment",
    "subscription",
    "discord-sku",
]);

export async function getEntitlementSummary(
    discordId: string
): Promise<EntitlementSummary> {
    const entitlements =
        await getActiveEntitlements(
            discordId
        );

    const premium =
        pickPrimaryPremium(
            entitlements
        );

    const source =
        (
            premium?.source ?? ""
        )
            .trim()
            .toLowerCase();

    return {
        plan: premium
            ? "PREMIUM"
            : "FREE",

        premium,

        renewsAt:
            premium?.endsAt ??
            null,

        isPromotional:
            premium !== null &&
            !PAID_SOURCES.has(
                source
            ),
    };
}

/**
 * Grants an entitlement by superseding whatever the user already has
 * of that type.
 *
 * "Entitlement" has no unique constraint on (userId, type), so a naive
 * INSERT would stack rows and make "when does Premium end?" ambiguous.
 * Revoking first keeps at most one live row per (user, type), which is
 * the invariant every read above assumes.
 *
 * `preservePermanent` relaxes that invariant for the one case where
 * superseding is actively wrong: a paid, expiring grant must not erase
 * an entitlement that was issued without an end date. See the option's
 * documentation on the input type.
 *
 * When `externalEntitlementId` is supplied the write is idempotent:
 * a replayed webhook or a renewal for the same provider entitlement
 * updates the existing row instead of creating a second one. That is
 * also what makes the unique index on the column safe.
 *
 * Billing calls this when a payment succeeds; it is not itself a
 * payment. The entitlement outlives the provider, so cancelling at
 * the provider only stops future renewals.
 */
export async function grantEntitlement(
    discordId: string,
    input: {
        type: EntitlementType;
        source: string;

        startsAt?: Date;
        endsAt?: Date | null;

        skuId?: string | null;
        externalEntitlementId?: string | null;

        /**
         * When true, a finite grant leaves an existing permanent
         * entitlement of the same type alone instead of superseding it.
         *
         * Billing sets this so that buying a month of Premium cannot
         * switch off an account whose access was granted permanently.
         * The grandfathered grant is only re-asserted at login, so
         * superseding it here would lock the owner out immediately and
         * not let them back in until they signed in again.
         */
        preservePermanent?: boolean;
    }
): Promise<EntitlementRecord | null> {
    const record = await withTransaction(
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
                return null;
            }

            const externalId =
                input.externalEntitlementId
                    ?.trim() || null;

            if (externalId) {
                const existing =
                    await client.query<
                        EntitlementRecord
                    >(
                        `
                        UPDATE "Entitlement"
                        SET
                            "active" = true,
                            "endsAt" = $3,
                            "skuId" = COALESCE(
                                $4,
                                "skuId"
                            ),
                            "updatedAt" = NOW()
                        WHERE
                            "externalEntitlementId" = $2
                            AND "userId" = $1
                        RETURNING
                            id,
                            type,
                            source,
                            "active",
                            "skuId",
                            "externalEntitlementId",
                            "startsAt",
                            "endsAt"
                        `,
                        [
                            userId,
                            externalId,
                            input.endsAt ?? null,
                            input.skuId ?? null,
                        ]
                    );

                if (
                    existing.rows.length > 0
                ) {
                    return (
                        existing.rows[0] ??
                        null
                    );
                }
            }

            /*
             * A permanent entitlement is only superseded by another
             * permanent one. When `preservePermanent` is set and this
             * grant expires, the supersede pass skips any row with no
             * end date and leaves it live; the account then holds two
             * active rows of the same type until the paid one lapses,
             * and `pickPrimaryPremium` decides which one to describe.
             */
            await client.query(
                `
                UPDATE "Entitlement"
                SET
                    "active" = false,
                    "updatedAt" = NOW()
                WHERE
                    "userId" = $1
                    AND type = $2::"EntitlementType"
                    AND "active" = true
                    AND (
                        $3::boolean IS NOT TRUE
                        OR "endsAt" IS NOT NULL
                    )
                `,
                [
                    userId,
                    input.type,
                    input.preservePermanent === true &&
                        (input.endsAt ?? null) !== null,
                ]
            );

            const inserted =
                await client.query<EntitlementRecord>(
                    `
                    INSERT INTO "Entitlement" (
                        id,
                        "userId",
                        type,
                        source,
                        "active",
                        "skuId",
                        "externalEntitlementId",
                        "startsAt",
                        "endsAt",
                        "createdAt",
                        "updatedAt"
                    )
                    VALUES (
                        $1,
                        $2,
                        $3::"EntitlementType",
                        $4,
                        true,
                        $5,
                        $6,
                        COALESCE($7::timestamptz, NOW()),
                        $8,
                        NOW(),
                        NOW()
                    )
                    RETURNING
                        id,
                        type,
                        source,
                        "active",
                        "skuId",
                        "externalEntitlementId",
                        "startsAt",
                        "endsAt"
                    `,
                    [
                        crypto.randomUUID(),
                        userId,
                        input.type,
                        input.source,
                        input.skuId ?? null,
                        externalId,
                        input.startsAt ?? null,
                        input.endsAt ?? null,
                    ]
                );

            return (
                inserted.rows[0] ??
                null
            );
        }
    );

    /*
     * Notifying here rather than at each call site means a grant made by
     * the store, by staff, by the dev endpoint or by the grandfather pass
     * all produce the same notice. Deduping on the entitlement id keeps a
     * replayed webhook from sending it twice.
     */
    if (record) {
        await createNotificationForDiscordUser(
            discordId,
            {
                type:
                    input.type === "SERVER_PREMIUM"
                        ? "SERVER"
                        : "PREMIUM_GRANTED",
                title:
                    input.type === "SERVER_PREMIUM"
                        ? "Server Premium is active"
                        : "Premium is now active",
                body:
                    input.type === "SERVER_PREMIUM"
                        ? "Your server unlocked the Premium bot features."
                        : "Thanks for supporting Aesthetic King. Your new limits are live on the billing page.",
                href: "/dashboard/premium/billing",
                icon: "Crown",
                dedupeKey: `premium-granted:${record.id}`,
            }
        );
    }

    return record;
}

/**
 * Ends an entitlement immediately.
 *
 * Sets `active` false rather than deleting, so the record of what the
 * user once had survives for support and auditing.
 */
export async function revokeEntitlement(
    discordId: string,
    type: EntitlementType
): Promise<number> {
    const result =
        await query(
            `
            UPDATE "Entitlement" e
            SET
                "active" = false,
                "updatedAt" = NOW()
            FROM "User" u
            WHERE
                e."userId" = u.id
                AND u."discordId" = $1
                AND e.type = $2::"EntitlementType"
                AND e."active" = true
            `,
            [
                discordId,
                type,
            ]
        );

    const count = result.rowCount ?? 0;

    if (count > 0) {
        await createNotificationForDiscordUser(
            discordId,
            {
                type: "PREMIUM_REVOKED",
                title:
                    type === "SERVER_PREMIUM"
                        ? "Server Premium ended"
                        : "Premium ended",
                body:
                    "The Premium features on this plan are no longer available. Nothing you created was deleted.",
                href: "/dashboard/premium/billing",
                icon: "Crown",
                dedupeKey:
                    `premium-revoked:${type}:${Date.now()}`,
            }
        );
    }

    return count;
}

/**
 * Ends the entitlement a provider is refunding or deleting.
 *
 * A refund webhook names the provider's own entitlement id, not the
 * user, so this is the only lookup that works. Returns the number of
 * rows ended; zero means the id was never recorded here, which is the
 * expected answer while the store is still wired up.
 */
export async function revokeEntitlementByExternalId(
    externalEntitlementId: string
): Promise<number> {
    const id =
        externalEntitlementId.trim();

    if (!id) {
        return 0;
    }

    const result =
        await query(
            `
            UPDATE "Entitlement"
            SET
                "active" = false,
                "updatedAt" = NOW()
            WHERE
                "externalEntitlementId" = $1
                AND "active" = true
            `,
            [
                id,
            ]
        );

    return result.rowCount ?? 0;
}

/**
 * Every entitlement the user has ever had, live or expired, for the
 * billing page. Reads the raw table rather than the active-only
 * helpers so an expired row is visible instead of silently gone.
 */
export async function getAllEntitlements(
    discordId: string
): Promise<
    Array<
        EntitlementRecord & {
            createdAt: Date;
        }
    >
> {
    const result =
        await query<
            EntitlementRecord & {
                createdAt: Date;
            }
        >(
            `
            SELECT
                ${ENTITLEMENT_COLUMNS},
                e."createdAt"
            FROM "Entitlement" e
            INNER JOIN "User" u
                ON u.id = e."userId"
            WHERE u."discordId" = $1
            ORDER BY e."createdAt" DESC
            LIMIT 25
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}
