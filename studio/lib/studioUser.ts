import {
    query,
} from "./database";

import type {
    StudioUser,
} from "./users";

/**
 * Resolves a Discord snowflake into the Studio account row.
 *
 * Session tokens only carry `discordId`, so anything that needs the
 * internal `userId` (joins, ledger writes, ownership checks) goes
 * through here rather than trusting client input.
 */
export async function getStudioUserByDiscordId(
    discordId: string
): Promise<StudioUser | null> {
    const result =
        await query<StudioUser>(
            `
            SELECT
                id,
                "discordId",
                username,
                "displayName",
                "avatarHash"
            FROM "User"
            WHERE "discordId" = $1
            LIMIT 1
            `,
            [
                discordId,
            ]
        );

    return (
        result.rows[0] ?? null
    );
}

/**
 * Same lookup, but only the id. Returns null when the account has
 * not finished onboarding, which callers should treat as "no
 * entitlements and no usage".
 */
export async function getStudioUserId(
    discordId: string
): Promise<string | null> {
    const result =
        await query<{
            id: string;
        }>(
            `
            SELECT id
            FROM "User"
            WHERE "discordId" = $1
            LIMIT 1
            `,
            [
                discordId,
            ]
        );

    return (
        result.rows[0]?.id ?? null
    );
}
