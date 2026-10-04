import {
    query,
} from "./database";

import {
    creatorProfileHref,
    normalizeDiscordId,
} from "./creatorHref";

export {
    creatorProfileHref,
    normalizeDiscordId,
};

/**
 * The public creator surface.
 *
 * A creator profile is a *projection* of what someone has already put in
 * the Discover feed — it creates no new content and stores nothing of its
 * own. That is the whole privacy argument for this page: everything shown
 * here is already visible to any signed-in user in the feed, just grouped
 * by author. Nothing from a private library (unshared aesthetics,
 * palettes, profiles, collections) is reachable through this module.
 *
 * Because the page is addressed by Discord snowflake, `normalizeDiscordId`
 * gates every lookup: a snowflake is always digits, so garbage from the URL
 * bar costs a regex rather than a query.
 */

export type CreatorProfile = {
    discordId: string;
    username: string | null;
    displayName: string | null;
    avatarHash: string | null;
    joinedAt: Date;

    postCount: number;
    profileCount: number;
    paletteCount: number;
    assetSetCount: number;

    likesReceived: number;
    commentsReceived: number;

    /**
     * How many saved items other accounts built from this creator's posts.
     * Counted over the library, not the feed, so it still counts when the
     * remixer never publishes what they made.
     */
    remixesReceived: number;
};

export type CreatorTag = {
    tag: string;
    count: number;
};

/**
 * Resolves a creator, or null when the account has never signed into the
 * Studio. A real Discord user with no Studio row has no published work by
 * definition, so there is nothing to show and the page 404s.
 */
export async function getCreatorProfile(
    rawDiscordId: string
): Promise<CreatorProfile | null> {
    const discordId =
        normalizeDiscordId(rawDiscordId);

    if (!discordId) {
        return null;
    }

    const result =
        await query<CreatorProfile>(
            `
            SELECT
                u."discordId" AS "discordId",
                u.username AS "username",
                u."displayName" AS "displayName",
                u."avatarHash" AS "avatarHash",
                u."createdAt" AS "joinedAt",

                COALESCE(stats.posts, 0)::int AS "postCount",
                COALESCE(stats.profiles, 0)::int AS "profileCount",
                COALESCE(stats.palettes, 0)::int AS "paletteCount",
                COALESCE(stats.sets, 0)::int AS "assetSetCount",
                COALESCE(stats.likes, 0)::int AS "likesReceived",
                COALESCE(stats.comments, 0)::int AS "commentsReceived",
                COALESCE(remixes.total, 0)::int AS "remixesReceived"
            FROM "User" u
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::bigint AS posts,

                    COUNT(*) FILTER (
                        WHERE sp."itemType" = 'AESTHETIC'
                    )::bigint AS profiles,

                    COUNT(*) FILTER (
                        WHERE sp."itemType" = 'PALETTE'
                    )::bigint AS palettes,

                    COUNT(*) FILTER (
                        WHERE sp."itemType" = 'ASSET'
                    )::bigint AS sets,

                    COALESCE(
                        SUM(sp."likeCount"),
                        0
                    )::bigint AS likes,

                    COALESCE(
                        SUM(sp."commentCount"),
                        0
                    )::bigint AS comments
                FROM "SharedPost" sp
                WHERE sp."userId" = u.id
            ) stats ON TRUE
            /*
             * A separate lateral rather than another FILTER on stats: a remix
             * lives in the library, not the feed, so it cannot be counted from
             * SharedPost. Both item tables are summed because either kind of
             * post can be remixed.
             */
            LEFT JOIN LATERAL (
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM "SavedAesthetic" sa
                        WHERE
                            sa."remixedFromUserId" = u.id
                    )
                    +
                    (
                        SELECT COUNT(*)
                        FROM "SavedPalette" spal
                        WHERE
                            spal."remixedFromUserId" = u.id
                    ) AS total
            ) remixes ON TRUE
            WHERE u."discordId" = $1
            LIMIT 1
            `,
            [
                discordId,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

/**
 * The tags this creator's posts use most, for a quick "they make cozy
 * stuff" read. Each tag links straight into the Discover tag filter, so a
 * creator page is a way into the feed rather than a dead end.
 */
export async function getCreatorTopTags(
    rawDiscordId: string,
    limit = 10
): Promise<CreatorTag[]> {
    const discordId =
        normalizeDiscordId(rawDiscordId);

    if (!discordId) {
        return [];
    }

    const result =
        await query<CreatorTag>(
            `
            SELECT
                tagged.tag AS "tag",
                COUNT(*)::int AS "count"
            FROM "SharedPost" sp
            INNER JOIN "User" u
                ON u.id = sp."userId"
            CROSS JOIN LATERAL unnest(sp.tags) AS tagged(tag)
            WHERE u."discordId" = $1
            GROUP BY tagged.tag
            ORDER BY "count" DESC, tagged.tag ASC
            LIMIT $2
            `,
            [
                discordId,
                Math.min(
                    Math.max(limit, 1),
                    30
                ),
            ]
        );

    return result.rows;
}
