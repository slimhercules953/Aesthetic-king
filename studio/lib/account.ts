import {
    query,
} from "./database";

import {
    getStudioUserByDiscordId,
} from "./studioUser";

import type {
    StudioUser,
} from "./users";

export type AccountDetails = {
    user: StudioUser;

    createdAt: Date | null;

    /** True once the user has exchanged a Discord OAuth code. */
    hasDiscordConnection: boolean;

    counts: {
        aesthetics: number;
        palettes: number;
        profiles: number;
        collections: number;
        shared: number;
    };
};

function toCount(value: string | number | null | undefined) {
    return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * Everything the account page shows, in one round trip.
 *
 * The counts are deliberately subqueries against the same `userId`
 * rather than five separate loaders — they are only ever read together,
 * and a single statement keeps the page's server render to one query.
 */
export async function getAccountDetails(
    discordId: string
): Promise<AccountDetails | null> {
    const user =
        await getStudioUserByDiscordId(discordId);

    if (!user) {
        return null;
    }

    const result =
        await query<{
            created_at: Date | null;
            has_connection: boolean | null;
            aesthetics: string | number | null;
            palettes: string | number | null;
            profiles: string | number | null;
            collections: string | number | null;
            shared: string | number | null;
        }>(
            `
            SELECT
                u."createdAt" AS created_at,

                EXISTS (
                    SELECT 1
                    FROM "DiscordOAuthCredential" c
                    WHERE c."userId" = u.id
                ) AS has_connection,

                (
                    SELECT COUNT(*)::bigint
                    FROM "SavedAesthetic" a
                    WHERE a."userId" = u.id
                ) AS aesthetics,

                (
                    SELECT COUNT(*)::bigint
                    FROM "SavedPalette" p
                    WHERE p."userId" = u.id
                ) AS palettes,

                (
                    SELECT COUNT(*)::bigint
                    FROM "Profile" pr
                    WHERE pr."userId" = u.id
                ) AS profiles,

                (
                    SELECT COUNT(*)::bigint
                    FROM "Collection" c
                    WHERE c."userId" = u.id
                ) AS collections,

                (
                    SELECT COUNT(*)::bigint
                    FROM "SharedPost" s
                    WHERE s."userId" = u.id
                ) AS shared

            FROM "User" u
            WHERE u.id = $1
            LIMIT 1
            `,
            [user.id]
        );

    const row = result.rows[0];

    if (!row) {
        return {
            user,
            createdAt: null,
            hasDiscordConnection: false,
            counts: {
                aesthetics: 0,
                palettes: 0,
                profiles: 0,
                collections: 0,
                shared: 0,
            },
        };
    }

    return {
        user,
        createdAt: row.created_at ?? null,
        hasDiscordConnection: Boolean(row.has_connection),
        counts: {
            aesthetics: toCount(row.aesthetics),
            palettes: toCount(row.palettes),
            profiles: toCount(row.profiles),
            collections: toCount(row.collections),
            shared: toCount(row.shared),
        },
    };
}

/**
 * Permanently removes the Studio account.
 *
 * Every owned row is `ON DELETE CASCADE` from `User`, so deleting the
 * account row is the whole operation — but anything the user *created
 * inside another user's data* (likes, comments) cascades too, which is
 * why the UI has to be explicit that this is not a sign-out.
 *
 * Returns false when the account does not exist, which the caller turns
 * into the same success response so the endpoint cannot be used to
 * probe for accounts.
 */
export async function deleteAccount(
    discordId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "User"
            WHERE "discordId" = $1
            `,
            [discordId]
        );

    return (result.rowCount ?? 0) > 0;
}
