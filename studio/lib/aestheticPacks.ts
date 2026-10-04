import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

import {
    getFeedPostById,
    publishVerifiedItemToFeed,
    removePostsForItem,
    type SharedPostSummary,
} from "./sharedFeed";

export type ServerAestheticPack = {
    id: string;
    guildId: string;
    name: string;
    description: string | null;
    aestheticId: string | null;
    moodId: string | null;
    colors: string[];
    symbols: string[];
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    /**
     * Whether the pack currently has a Discover post.
     *
     * Derived from `SharedPost` rather than stored on the pack. A column would
     * have to be kept in sync with an unpublish from the feed, which deletes
     * by post id and knows nothing about packs; a join cannot go stale.
     */
    published: boolean;
};

/** The `AestheticPack` columns, before the derived `published` flag. */
type AestheticPackRow =
    Omit<ServerAestheticPack, "published">;

/**
 * Adds `published` to a row that came from an INSERT/UPDATE `RETURNING`.
 *
 * `RETURNING` cannot evaluate an `EXISTS` subquery against another table, so
 * the write paths ask separately. A brand-new pack is never published, which
 * is why {@link newPack} skips the query.
 */
async function withPublished(
    pack: AestheticPackRow
): Promise<ServerAestheticPack> {
    return {
        ...pack,
        published:
            (await getPackPostId(pack.id)) !== null,
    };
}

export async function getServerAestheticPacks(
    discordGuildId: string
): Promise<ServerAestheticPack[]> {
    const result =
        await query<AestheticPackRow & {
            published: boolean;
        }>(
            `
                SELECT
                    p.id,
                    p."guildId",
                    p.name,
                    p.description,
                    p."aestheticId",
                    p."moodId",
                    p.colors,
                    p.symbols,
                    p.enabled,
                    p."createdAt",
                    p."updatedAt",

                    EXISTS (
                        SELECT 1
                        FROM "SharedPost" sp
                        WHERE
                            sp."itemType" =
                                'PACK'::"SharedItemType"
                            AND sp."itemId" = p.id
                    ) AS published

                FROM "AestheticPack" p

                INNER JOIN "Guild" g
                    ON g.id =
                        p."guildId"

                WHERE
                    g."discordId" =
                        $1

                ORDER BY
                    p.name ASC
            `,
            [
                discordGuildId,
            ]
        );

    return result.rows;
}

export async function createServerAestheticPack(
    discordGuildId: string,
    input: {
        name: string;
        description?: string | null;
        aestheticId?: string | null;
        moodId?: string | null;
        colors?: string[];
        symbols?: string[];
        enabled?: boolean;
    }
): Promise<ServerAestheticPack> {
    const result =
        await query<AestheticPackRow>(
            `
                INSERT INTO "AestheticPack" (
                    id,
                    "guildId",
                    name,
                    description,
                    "aestheticId",
                    "moodId",
                    colors,
                    symbols,
                    enabled,
                    "createdAt",
                    "updatedAt"
                )

                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    NOW(),
                    NOW()

                FROM "Guild" g

                WHERE
                    g."discordId" =
                        $1

                RETURNING
                    id,
                    "guildId",
                    name,
                    description,
                    "aestheticId",
                    "moodId",
                    colors,
                    symbols,
                    enabled,
                    "createdAt",
                    "updatedAt"
            `,
            [
                discordGuildId,
                input.name,
                input.description ?? null,
                input.aestheticId ?? null,
                input.moodId ?? null,
                input.colors ?? [],
                input.symbols ?? [],
                input.enabled ?? true,
            ]
        );

    const pack =
        result.rows[0];

    if (!pack) {
        throw new ExpectedError(
            "Aesthetic King is not installed in this Discord server."
        );
    }

    return { ...pack, published: false };
}

export async function updateServerAestheticPack(
    discordGuildId: string,
    packId: string,
    input: {
        name: string;
        description?: string | null;
        aestheticId?: string | null;
        moodId?: string | null;
        colors?: string[];
        symbols?: string[];
        enabled?: boolean;
    }
): Promise<ServerAestheticPack> {
    const result =
        await query<AestheticPackRow>(
            `
                UPDATE "AestheticPack" p

                SET
                    name = $3,
                    description = $4,
                    "aestheticId" = $5,
                    "moodId" = $6,
                    colors = $7,
                    symbols = $8,
                    enabled = $9,
                    "updatedAt" = NOW()

                FROM "Guild" g

                WHERE
                    p.id = $2
                    AND p."guildId" = g.id
                    AND g."discordId" = $1

                RETURNING
                    p.id,
                    p."guildId",
                    p.name,
                    p.description,
                    p."aestheticId",
                    p."moodId",
                    p.colors,
                    p.symbols,
                    p.enabled,
                    p."createdAt",
                    p."updatedAt"
            `,
            [
                discordGuildId,
                packId,
                input.name,
                input.description ?? null,
                input.aestheticId ?? null,
                input.moodId ?? null,
                input.colors ?? [],
                input.symbols ?? [],
                input.enabled ?? true,
            ]
        );

    const pack =
        result.rows[0];

    if (!pack) {
        throw new ExpectedError(
            "Aesthetic Pack was not found."
        );
    }

    return withPublished(pack);
}

export async function deleteServerAestheticPack(
    discordGuildId: string,
    packId: string
) {
    const result =
        await query(
            `
                DELETE FROM "AestheticPack" p

                USING "Guild" g

                WHERE
                    p.id = $2
                    AND p."guildId" = g.id
                    AND g."discordId" = $1
            `,
            [
                discordGuildId,
                packId,
            ]
        );

    if (
        (result.rowCount ?? 0) ===
        0
    ) {
        throw new ExpectedError(
            "Aesthetic Pack was not found."
        );
    }

    // `SharedPost.itemId` has no foreign key, so Postgres will not cascade
    // this away. Without it the card outlives the pack and sits in Discover
    // saying the content no longer exists.
    await removePostsForItem("PACK", packId);
}

/**
 * The pack, but only if it lives in this server.
 *
 * Every pack query in this file is scoped through `Guild.discordId` for the
 * same reason: a pack id on its own proves nothing about who may touch it.
 * Publishing to Discover needs this specifically, because the insert into
 * `SharedPost` is not guild-scoped and cannot be.
 */
async function getPackInGuild(
    discordGuildId: string,
    packId: string
): Promise<ServerAestheticPack | null> {
    const result =
        await query<AestheticPackRow & {
            published: boolean;
        }>(
            `
                SELECT
                    p.id,
                    p."guildId",
                    p.name,
                    p.description,
                    p."aestheticId",
                    p."moodId",
                    p.colors,
                    p.symbols,
                    p.enabled,
                    p."createdAt",
                    p."updatedAt",

                    EXISTS (
                        SELECT 1
                        FROM "SharedPost" sp
                        WHERE
                            sp."itemType" =
                                'PACK'::"SharedItemType"
                            AND sp."itemId" = p.id
                    ) AS published

                FROM "AestheticPack" p

                INNER JOIN "Guild" g
                    ON g.id =
                        p."guildId"

                WHERE
                    p.id = $2
                    AND g."discordId" = $1

                LIMIT 1
            `,
            [
                discordGuildId,
                packId,
            ]
        );

    return result.rows[0] ?? null;
}

/**
 * The published post for a pack, whoever published it.
 *
 * A pack gets one Discover post. `SharedPost` is unique on
 * `(userId, itemType, itemId)`, so a second manager of the same server
 * publishing the same pack would otherwise create a second card for it —
 * Discover showing the same pack twice, side by side, under two authors.
 */
async function getPackPostId(
    packId: string
): Promise<string | null> {
    const result =
        await query<{ id: string }>(
            `
                SELECT id
                FROM "SharedPost"
                WHERE
                    "itemType" = 'PACK'::"SharedItemType"
                    AND "itemId" = $1
                ORDER BY "createdAt" ASC
                LIMIT 1
            `,
            [packId]
        );

    return result.rows[0]?.id ?? null;
}

/**
 * Publishes a server's Aesthetic Pack to Discover.
 *
 * The author of the post is the member who published it, not the server:
 * `SharedPost.userId` is required and a guild cannot author anything. The
 * card shows the server's name alongside the author so it still reads as
 * "this pack belongs to that community".
 *
 * Entitlement is the caller's responsibility — every route reaching this is
 * behind `guardGuildAccess()`, which checks MANAGE_GUILD/ADMINISTRATOR against
 * Discord's own bitfield. That is why this file, not the feed route, owns the
 * pack path: the feed route has no guild context to check.
 *
 * Idempotent. Re-publishing an already-published pack returns the existing
 * post rather than re-awarding crowns to a second manager.
 */
export async function publishPackToFeed(
    discordGuildId: string,
    publisherDiscordId: string,
    packId: string,
    caption?: string | null
): Promise<SharedPostSummary> {
    const pack = await getPackInGuild(
        discordGuildId,
        packId
    );

    if (!pack) {
        throw new ExpectedError(
            "Aesthetic Pack was not found."
        );
    }

    const existingPostId =
        await getPackPostId(packId);

    if (existingPostId) {
        const existing =
            await getFeedPostById(
                existingPostId,
                publisherDiscordId
            );

        if (existing) {
            return existing;
        }
    }

    return publishVerifiedItemToFeed(
        publisherDiscordId,
        {
            itemType: "PACK",
            itemId: packId,
            caption:
                caption ?? pack.description,
        }
    );
}

/**
 * Removes a pack's Discover post.
 *
 * Deliberately not limited to the post's author. The member who published a
 * pack may have left the server, and whoever now manages it has to be able to
 * take it back down; the guild check the route already did is the authority
 * here.
 */
export async function unpublishPackFromFeed(
    discordGuildId: string,
    packId: string
): Promise<boolean> {
    const pack = await getPackInGuild(
        discordGuildId,
        packId
    );

    if (!pack) {
        throw new ExpectedError(
            "Aesthetic Pack was not found."
        );
    }

    return (
        await removePostsForItem("PACK", packId)
    ) > 0;
}

export async function getDefaultAestheticPackId(
    discordGuildId: string
): Promise<string | null> {
    const result =
        await query<{
            defaultPackId:
                string | null;
        }>(
            `
                SELECT
                    s."defaultPackId"

                FROM "GuildSettings" s

                INNER JOIN "Guild" g
                    ON g.id =
                        s."guildId"

                WHERE
                    g."discordId" =
                        $1

                LIMIT 1
            `,
            [
                discordGuildId,
            ]
        );

    return (
        result.rows[0]
            ?.defaultPackId ??
        null
    );
}

export async function setDefaultAestheticPack(
    discordGuildId: string,
    packId: string | null
) {
    if (packId) {
        const packResult =
            await query(
                `
                    SELECT
                        p.id

                    FROM "AestheticPack" p

                    INNER JOIN "Guild" g
                        ON g.id =
                            p."guildId"

                    WHERE
                        p.id = $2
                        AND g."discordId" =
                            $1

                    LIMIT 1
                `,
                [
                    discordGuildId,
                    packId,
                ]
            );

        if (
            (packResult.rowCount ??
                0) === 0
        ) {
            throw new ExpectedError(
                "Aesthetic Pack was not found."
            );
        }
    }

    const result =
        await query(
            `
                INSERT INTO "GuildSettings" (
                    id,
                    "guildId",
                    "defaultPackId",
                    "createdAt",
                    "updatedAt"
                )

                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    NOW(),
                    NOW()

                FROM "Guild" g

                WHERE
                    g."discordId" =
                        $1

                ON CONFLICT ("guildId")
                DO UPDATE SET
                    "defaultPackId" =
                        EXCLUDED."defaultPackId",

                    "updatedAt" =
                        NOW()
            `,
            [
                discordGuildId,
                packId,
            ]
        );

    if (
        (result.rowCount ?? 0) ===
        0
    ) {
        throw new ExpectedError(
            "Could not update the default Aesthetic Pack."
        );
    }
}
