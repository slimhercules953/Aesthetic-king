import {
    ExpectedError,
} from "./apiError";

import {
    query,
    withTransaction,
} from "./database";

import {
    awardForComment,
    awardForLike,
    awardForPublish,
} from "./crownEarning";

import {
    createNotificationForDiscordUser,
} from "./notifications";

import { getAssetSetById } from "./assetCatalog";

export type SharedItemType =
    | "AESTHETIC"
    | "PALETTE"
    | "ASSET"
    | "PROFILE"
    | "PACK";

/**
 * Every publishable type, in the order the UI lists them.
 *
 * Exported so the feed route validates the request body against the same
 * list the ownership guard uses. A type accepted by one and not the other
 * would either reject legitimate publishes or — worse — reach
 * `assertPublishableItem()` and fall through its `switch` unchecked.
 */
export const SHARED_ITEM_TYPES: readonly SharedItemType[] = [
    "AESTHETIC",
    "PALETTE",
    "ASSET",
    "PROFILE",
    "PACK",
];

export function isSharedItemType(
    value: unknown
): value is SharedItemType {
    return (
        typeof value === "string" &&
        SHARED_ITEM_TYPES.indexOf(
            value as SharedItemType
        ) !== -1
    );
}

export type SharedPostSummary = {
    id: string;
    itemType: SharedItemType;
    itemId: string;
    caption: string | null;
    tags: string[];
    likeCount: number;
    commentCount: number;
    createdAt: Date;

    authorId: string;
    authorDiscordId: string;
    authorUsername: string | null;
    authorDisplayName: string | null;
    authorAvatarHash: string | null;

    likedByViewer: boolean;
};

export type SharedPostComment = {
    id: string;
    postId: string;
    body: string;
    createdAt: Date;

    userId: string;
    /**
     * Needed so a comment's author can link to their public profile.
     * The internal `userId` is a cuid and is deliberately not used in
     * links — the snowflake is what every public surface is addressed by.
     */
    discordId: string;
    username: string | null;
    displayName: string | null;
    avatarHash: string | null;
};

/**
 * Refuses to publish something the publisher is not entitled to publish.
 *
 * `SharedPost.itemId` has no foreign key, so before this the feed route
 * would happily insert a post for *any* id it was given — including another
 * user's saved aesthetic. Nothing rendered it, because Discover hydrates the
 * item and the card links to an edit page the viewer cannot open, but the
 * victim's item name, palette and bio appeared on the card all the same.
 * Publishing someone's work for them, with their artwork on it, is exactly
 * what the remix rules already forbid.
 *
 * The check belongs in the lib rather than the route because
 * `shareItemToFeed()` is the only door into the table, and a second caller
 * (a bot command, a future bulk import) must not have to remember to repeat
 * it.
 *
 * `PACK` is refused outright. A pack belongs to a *server*, so entitlement
 * there is a Discord permission rather than an ownership row, and the
 * information needed to check it lives in the session's guild list. Packs
 * publish through `publishPackToFeed()`, which is scoped by guild id and
 * therefore cannot reach a pack in a server the publisher does not manage.
 */
async function assertPublishableItem(
    discordId: string,
    itemType: SharedItemType,
    itemId: string
): Promise<void> {
    if (itemType === "ASSET") {
        // Catalog profile sets are shared by definition — nobody owns them.
        // The entitlement that matters is PREMIUM_ASSETS for a premium set,
        // which the route already checks. It still has to be a real set, or
        // the post renders as "content that no longer exists" forever.
        if (!getAssetSetById(itemId)) {
            throw new ExpectedError(
                "That profile set does not exist.",
                404
            );
        }

        return;
    }

    if (itemType === "PACK") {
        throw new ExpectedError(
            "Aesthetic Packs are published from Server Studio.",
            400
        );
    }

    // One statement for the three owned types, with the type guard written
    // inside each branch. Interpolating a table name from the `itemType`
    // would be safe here (the value is already narrowed to a literal), but a
    // single parameterised statement is smaller, has one shape to test, and
    // cannot be broken by the next type added to the union.
    const result =
        await query<{ id: string }>(
            `
            SELECT item.id
            FROM (
                SELECT
                    sa.id,
                    sa."userId",
                    'AESTHETIC' AS "kind"
                FROM "SavedAesthetic" sa
                WHERE sa.id = $1

                UNION ALL

                SELECT
                    sp.id,
                    sp."userId",
                    'PALETTE'
                FROM "SavedPalette" sp
                WHERE sp.id = $1

                UNION ALL

                SELECT
                    pr.id,
                    pr."userId",
                    'PROFILE'
                FROM "Profile" pr
                WHERE pr.id = $1
            ) item
            INNER JOIN "User" u
                ON u.id = item."userId"

            WHERE
                item."kind" = $2
                AND u."discordId" = $3
            LIMIT 1
            `,
            [itemId, itemType, discordId]
        );

    if (!result.rows[0]) {
        throw new ExpectedError(
            "You can only publish something of your own.",
            403
        );
    }
}

function normalizeTags(
    input: (string | null | undefined)[]
): string[] {
    const cleaned = input
        .map((tag) =>
            (tag ?? "")
                .trim()
                .replace(/^#+/, "")
                .toLowerCase()
        )
        .filter(Boolean);

    return [...new Set(cleaned)].slice(0, 10);
}

/**
 * Inserts (or refreshes) the post row and returns it hydrated.
 *
 * Split out of {@link shareItemToFeed} because a pack's entitlement is a
 * Discord permission rather than an ownership row, so it cannot pass through
 * `assertPublishableItem()` — but it still needs the same upsert, the same
 * crown award, and the same return shape. Keeping the INSERT in one place is
 * what stops the two paths from drifting apart.
 *
 * Callers must have checked entitlement already.
 */
async function createOrUpdatePost(
    discordId: string,
    itemType: SharedItemType,
    itemId: string,
    caption: string | null,
    tags: string[]
): Promise<SharedPostSummary> {
    const result =
        await query<{
            id: string;
        }>(
            `
            INSERT INTO "SharedPost" (
                id,
                "userId",
                "itemType",
                "itemId",
                caption,
                tags,
                "likeCount",
                "commentCount",
                "createdAt",
                "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                $2::"SharedItemType",
                $3,
                $4,
                $5,
                0,
                0,
                NOW(),
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1
            ON CONFLICT ("userId", "itemType", "itemId")
            DO UPDATE SET
                caption = EXCLUDED.caption,
                tags = EXCLUDED.tags,
                "updatedAt" = NOW()
            RETURNING "SharedPost".id
            `,
            [
                discordId,
                itemType,
                itemId,
                caption,
                tags,
            ]
        );

    const inserted =
        result.rows[0];

    if (!inserted) {
        throw new ExpectedError(
            "Unable to share item. Make sure you are signed in."
        );
    }

    const post =
        await getFeedPostById(
            inserted.id,
            discordId
        );

    if (!post) {
        throw new ExpectedError(
            "Unable to load the shared post."
        );
    }

    await awardForPublish(
        discordId,
        itemType,
        itemId
    );

    return post;
}

/**
 * {@link shareItemToFeed} without the ownership check.
 *
 * For items whose entitlement is not an ownership row — currently only
 * Aesthetic Packs, where the right to publish is a Discord permission on the
 * server. The caller must have resolved the item through a guild-scoped query
 * before calling this, which is what makes it safe: a pack fetched by
 * `getPackInGuild(discordGuildId, packId)` cannot be a pack from a server the
 * publisher does not manage.
 */
export async function publishVerifiedItemToFeed(
    discordId: string,
    input: {
        itemType: SharedItemType;
        itemId: string;
        caption?: string | null;
        tags?: (string | null | undefined)[];
    }
): Promise<SharedPostSummary> {
    return createOrUpdatePost(
        discordId,
        input.itemType,
        input.itemId,
        input.caption?.trim() ?? null,
        normalizeTags(input.tags ?? [])
    );
}

/**
 * Publishes one of the caller's own items to Discover.
 *
 * Entitlement is checked here rather than in the route: this is the only door
 * into `SharedPost` for user-owned types, and a second caller must not have to
 * remember to repeat the check. Packs go through `publishPackToFeed()` in
 * `lib/aestheticPacks.ts` instead.
 */
export async function shareItemToFeed(
    discordId: string,
    input: {
        itemType: SharedItemType;
        itemId: string;
        caption?: string | null;
        tags?: (string | null | undefined)[];
    }
): Promise<SharedPostSummary> {
    await assertPublishableItem(
        discordId,
        input.itemType,
        input.itemId
    );

    return createOrUpdatePost(
        discordId,
        input.itemType,
        input.itemId,
        input.caption?.trim() ?? null,
        normalizeTags(input.tags ?? [])
    );
}

export const FEED_SELECT_SQL = `
    SELECT
        sp.id,
        sp."itemType",
        sp."itemId",
        sp.caption,
        sp.tags,
        sp."likeCount",
        sp."commentCount",
        sp."createdAt",
        u.id AS "authorId",
        u."discordId" AS "authorDiscordId",
        u.username AS "authorUsername",
        u."displayName" AS "authorDisplayName",
        u."avatarHash" AS "authorAvatarHash",
        EXISTS (
            SELECT 1
            FROM "SharedPostLike" spl
            INNER JOIN "User" viewer
                ON viewer.id = spl."userId"
            WHERE
                spl."postId" = sp.id
                AND viewer."discordId" = $1
        ) AS "likedByViewer"
    FROM "SharedPost" sp
    INNER JOIN "User" u
        ON u.id = sp."userId"
`;

export async function getFeedPosts(
    viewerDiscordId: string | null,
    options: {
        itemType?: SharedItemType | null;
        tag?: string | null;
        sort?: "recent" | "popular";
        limit?: number;
        offset?: number;
    } = {}
): Promise<SharedPostSummary[]> {
    const limit =
        Math.min(
            Math.max(
                options.limit ?? 24,
                1
            ),
            60
        );

    const offset =
        Math.max(
            options.offset ?? 0,
            0
        );

    const params: unknown[] = [
        viewerDiscordId,
    ];

    let filterSql = "";

    if (options.itemType) {
        params.push(options.itemType);
        filterSql +=
            ` AND sp."itemType" = $${params.length}::"SharedItemType"`;
    }

    if (options.tag) {
        params.push(
            options.tag
                .trim()
                .replace(/^#+/, "")
                .toLowerCase()
        );
        filterSql +=
            ` AND $${params.length} = ANY(sp.tags)`;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    params.push(offset);
    const offsetParam = `$${params.length}`;

    const orderSql =
        options.sort === "popular"
            ? `ORDER BY sp."likeCount" DESC, sp."createdAt" DESC`
            : `ORDER BY sp."createdAt" DESC`;

    const result =
        await query<SharedPostSummary>(
            `${FEED_SELECT_SQL}
            WHERE 1=1
            ${filterSql}
            ${orderSql}
            LIMIT ${limitParam}
            OFFSET ${offsetParam}
            `,
            params
        );

    return result.rows;
}

export async function getFeedPostById(
    id: string,
    viewerDiscordId: string | null
): Promise<SharedPostSummary | null> {
    const result =
        await query<SharedPostSummary>(
            `${FEED_SELECT_SQL}
            WHERE sp.id = $2
            LIMIT 1
            `,
            [
                viewerDiscordId,
                id,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

/**
 * True when the user already has a post for this item.
 *
 * `shareItemToFeed` upserts, so re-sharing something already in the
 * feed edits the existing post rather than publishing a new one. The
 * publish limit must not charge for that.
 */
export async function hasSharedItem(
    discordId: string,
    input: {
        itemType: SharedItemType;
        itemId: string;
    }
): Promise<boolean> {
    const result =
        await query<{
            exists: boolean;
        }>(
            `
            SELECT EXISTS (
                SELECT 1
                FROM "SharedPost" sp
                INNER JOIN "User" u
                    ON u.id = sp."userId"
                WHERE
                    u."discordId" = $1
                    AND sp."itemType" = $2::"SharedItemType"
                    AND sp."itemId" = $3
            ) AS exists
            `,
            [
                discordId,
                input.itemType,
                input.itemId,
            ]
        );

    return (
        result.rows[0]?.exists ??
        false
    );
}

/**
 * Everything one account has published, newest first.
 *
 * This is the creator profile page's data source. It is not filtered by
 * the viewer: published posts are public within the Studio by design,
 * which is the whole point of Discover.
 */
export async function getFeedPostsByAuthorDiscordId(
    authorDiscordId: string,
    viewerDiscordId: string | null,
    limit = 30
): Promise<SharedPostSummary[]> {
    const result =
        await query<SharedPostSummary>(
            `${FEED_SELECT_SQL}
            WHERE u."discordId" = $2
            ORDER BY sp."createdAt" DESC
            LIMIT $3
            `,
            [
                viewerDiscordId,
                authorDiscordId,
                Math.min(
                    Math.max(limit, 1),
                    60
                ),
            ]
        );

    return result.rows;
}

export async function unshareItemById(
    id: string,
    discordId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "SharedPost" sp
            USING "User" u
            WHERE
                sp.id = $1
                AND sp."userId" = u.id
                AND u."discordId" = $2
            RETURNING sp.id
            `,
            [
                id,
                discordId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

/**
 * Deletes the published posts pointing at an item that is going away.
 *
 * `SharedPost.itemId` deliberately has no foreign key — the feed is
 * polymorphic, so Postgres cannot cascade for it. Without this call, the
 * card survives its subject and Discover shows "This post references content
 * that no longer exists" forever, still counting against the publisher's
 * limit and still appearing in the author's own list.
 *
 * Every delete path for a publishable item should call it. It is not
 * enforced by the database, which is the trade-off the polymorphic design
 * makes; the alternative is five nullable FK columns on the feed.
 *
 * Deliberately not scoped by user: the caller has already established that
 * the item is theirs (or, for packs, that the guild is theirs), and the item
 * id is unique, so the extra join would only add a way to get it wrong.
 */
export async function removePostsForItem(
    itemType: SharedItemType,
    itemId: string
): Promise<number> {
    const result =
        await query(
            `
            DELETE FROM "SharedPost"
            WHERE
                "itemType" = $1::"SharedItemType"
                AND "itemId" = $2
            `,
            [itemType, itemId]
        );

    return result.rowCount ?? 0;
}

export async function toggleSharedPostLike(
    postId: string,
    discordId: string
): Promise<{
    liked: boolean;
    likeCount: number;
} | null> {
    /*
     * The like row and the cached "likeCount" have to change together, and
     * the recount has to happen *after* the insert/delete is visible.
     *
     * Doing both in one statement with data-modifying CTEs looks tidy but is
     * wrong: every CTE in a statement reads the same snapshot, so a recount
     * CTE cannot see the row its sibling CTE just inserted or deleted. The
     * stored count then trails the truth by exactly one toggle, which is the
     * "I unliked my own post and it now says 1 like" bug.
     *
     * Locking the post row for the whole transaction also stops two people
     * liking at the same moment from each recounting off the same snapshot
     * and quietly losing one of the two likes.
     */
    const outcome =
        await withTransaction(
            async (client) => {
                const post =
                    await client.query<{
                        "id": string;
                        "authorDiscordId": string | null;
                        "itemType": string | null;
                    }>(
                        `
                        SELECT
                            sp.id,
                            au."discordId" AS "authorDiscordId",
                            sp."itemType"::text AS "itemType"
                        FROM "SharedPost" sp
                        LEFT JOIN "User" au
                            ON au.id = sp."userId"
                        WHERE sp.id = $1
                        FOR UPDATE OF sp
                        `,
                        [
                            postId,
                        ]
                    );

                const postRow =
                    post.rows[0];

                if (!postRow) {
                    return null;
                }

                const actor =
                    await client.query<{
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

                const actorId =
                    actor.rows[0]?.id;

                if (!actorId) {
                    return null;
                }

                const removed =
                    await client.query(
                        `
                        DELETE FROM "SharedPostLike"
                        WHERE
                            "postId" = $1
                            AND "userId" = $2
                        `,
                        [
                            postId,
                            actorId,
                        ]
                    );

                /*
                 * A row coming back out of the DELETE means the like already
                 * existed, so this click removed it. Only when nothing was
                 * deleted do we add the like, and only then is the post
                 * "liked" afterwards.
                 */
                const wasLiked =
                    (removed.rowCount ?? 0) > 0;

                let liked =
                    false;

                if (!wasLiked) {
                    const inserted =
                        await client.query(
                            `
                            INSERT INTO "SharedPostLike" (
                                "userId",
                                "postId",
                                "createdAt"
                            )
                            VALUES ($2, $1, NOW())
                            ON CONFLICT ("userId", "postId")
                                DO NOTHING
                            `,
                            [
                                postId,
                                actorId,
                            ]
                        );

                    liked =
                        (inserted.rowCount ?? 0) > 0;
                }

                /*
                 * A separate statement, so this COUNT sees the row that was
                 * just inserted or deleted.
                 */
                const counted =
                    await client.query<{
                        likeCount: number;
                    }>(
                        `
                        UPDATE "SharedPost"
                        SET
                            "likeCount" = (
                                SELECT COUNT(*)::int
                                FROM "SharedPostLike"
                                WHERE "postId" = $1
                            ),
                            "updatedAt" = NOW()
                        WHERE id = $1
                        RETURNING "likeCount"::int AS "likeCount"
                        `,
                        [
                            postId,
                        ]
                    );

                return {
                    liked,
                    likeCount: Number(
                        counted.rows[0]?.likeCount ?? 0
                    ),
                    authorDiscordId:
                        postRow.authorDiscordId,
                    itemType:
                        postRow.itemType,
                };
            }
        );

    if (!outcome) {
        return null;
    }

    const {
        liked,
        likeCount,
    } = outcome;

    if (liked) {
        await awardForLike(
            String(outcome.authorDiscordId ?? ""),
            discordId,
            postId
        );

        /*
         * The author gets a bell notice for the same event. Self-likes are
         * skipped — nobody wants to be told they liked their own post — and
         * the dedupe key means un-liking then re-liking does not stack
         * notices for the same pair.
         */
        const authorDiscordId =
            String(outcome.authorDiscordId ?? "");

        if (authorDiscordId && authorDiscordId !== discordId) {
            const kind =
                outcome.itemType === "PALETTE"
                    ? "palette"
                    : outcome.itemType === "ASSET"
                        ? "asset set"
                        : "aesthetic";

            const likerResult =
                await query<{
                    likerUsername: string | null;
                }>(
                    `
                    SELECT COALESCE(
                        "displayName",
                        "username"
                    ) AS "likerUsername"
                    FROM "User"
                    WHERE "discordId" = $1
                    LIMIT 1
                    `,
                    [
                        discordId,
                    ]
                );

            const liker =
                String(
                    likerResult.rows[0]?.likerUsername ?? ""
                ).trim() ||
                "Someone";

            await createNotificationForDiscordUser(
                authorDiscordId,
                {
                    type: "LIKE",
                    title: `${liker} liked your ${kind}`,
                    body: null,
                    href: "/dashboard/discover",
                    icon: "Heart",
                    dedupeKey:
                        `like:${postId}:${discordId}`,
                }
            );
        }
    }

    return {
        liked,
        likeCount,
    };
}

export async function getSharedPostComments(
    postId: string
): Promise<SharedPostComment[]> {
    const result =
        await query<SharedPostComment>(
            `
            SELECT
                spc.id,
                spc."postId",
                spc.body,
                spc."createdAt",
                u.id AS "userId",
                u."discordId",
                u.username,
                u."displayName",
                u."avatarHash"
            FROM "SharedPostComment" spc
            INNER JOIN "User" u
                ON u.id = spc."userId"
            WHERE
                spc."postId" = $1
            ORDER BY
                spc."createdAt" ASC
            LIMIT 100
            `,
            [
                postId,
            ]
        );

    return result.rows;
}

export async function getSharedPostCommentsByPostIds(
    postIds: string[],
    perPostLimit = 20
): Promise<Map<string, SharedPostComment[]>> {
    const grouped =
        new Map<string, SharedPostComment[]>();

    if (postIds.length === 0) {
        return grouped;
    }

    const result =
        await query<SharedPostComment>(
            `
            SELECT
                ranked.id,
                ranked."postId",
                ranked.body,
                ranked."createdAt",
                ranked."userId",
                ranked."discordId",
                ranked.username,
                ranked."displayName",
                ranked."avatarHash"
            FROM (
                SELECT
                    spc.id,
                    spc."postId",
                    spc.body,
                    spc."createdAt",
                    u.id AS "userId",
                    u."discordId",
                    u.username,
                    u."displayName",
                    u."avatarHash",
                    ROW_NUMBER() OVER (
                        PARTITION BY spc."postId"
                        ORDER BY spc."createdAt" ASC
                    ) AS rn
                FROM "SharedPostComment" spc
                INNER JOIN "User" u
                    ON u.id = spc."userId"
                WHERE spc."postId" = ANY($1::text[])
            ) ranked
            WHERE ranked.rn <= $2
            ORDER BY
                ranked."postId",
                ranked."createdAt" ASC
            `,
            [
                postIds,
                perPostLimit,
            ]
        );

    for (const row of result.rows) {
        const existing =
            grouped.get(row.postId);

        if (existing) {
            existing.push(row);
        } else {
            grouped.set(
                row.postId,
                [row]
            );
        }
    }

    return grouped;
}

export async function addSharedPostComment(
    postId: string,
    discordId: string,
    body: string
): Promise<SharedPostComment | null> {
    const trimmed =
        body.trim();

    if (!trimmed) {
        throw new ExpectedError(
            "Comment cannot be empty."
        );
    }

    if (trimmed.length > 500) {
        throw new ExpectedError(
            "Comment is too long (max 500 characters)."
        );
    }

    /*
     * Same reason as toggleSharedPostLike: the cached "commentCount" is
     * recomputed in its own statement so that the COUNT actually sees the
     * comment that was just inserted. Inside one statement the recount would
     * read the pre-insert snapshot and the stored count would trail by one.
     */
    const row =
        await withTransaction(
            async (client) => {
                const post =
                    await client.query<{
                        "id": string;
                        "authorDiscordId": string | null;
                    }>(
                        `
                        SELECT
                            sp.id,
                            au."discordId" AS "authorDiscordId"
                        FROM "SharedPost" sp
                        LEFT JOIN "User" au
                            ON au.id = sp."userId"
                        WHERE sp.id = $1
                        FOR UPDATE OF sp
                        `,
                        [
                            postId,
                        ]
                    );

                const postRow =
                    post.rows[0];

                if (!postRow) {
                    return null;
                }

                const inserted =
                    await client.query<
                        SharedPostComment & {
                            authorDiscordId: string | null;
                        }
                    >(
                        `
                        WITH actor AS (
                            SELECT id
                            FROM "User"
                            WHERE "discordId" = $2
                            LIMIT 1
                        ),
                        inserted AS (
                            INSERT INTO "SharedPostComment" (
                                id,
                                "postId",
                                "userId",
                                body,
                                "createdAt"
                            )
                            SELECT
                                gen_random_uuid()::text,
                                $1,
                                actor.id,
                                $3,
                                NOW()
                            FROM actor
                            RETURNING id, "postId", "userId", body, "createdAt"
                        )
                        SELECT
                            spc.id,
                            spc."postId",
                            spc.body,
                            spc."createdAt",
                            u.id AS "userId",
                            u."discordId",
                            u.username,
                            u."displayName",
                            u."avatarHash",
                            $4 AS "authorDiscordId"
                        FROM inserted spc
                        INNER JOIN "User" u
                            ON u.id = spc."userId"
                        LIMIT 1
                        `,
                        [
                            postId,
                            discordId,
                            trimmed,
                            postRow.authorDiscordId,
                        ]
                    );

                const commentRow =
                    inserted.rows[0];

                if (!commentRow) {
                    return null;
                }

                await client.query(
                    `
                    UPDATE "SharedPost"
                    SET
                        "commentCount" = (
                            SELECT COUNT(*)::int
                            FROM "SharedPostComment"
                            WHERE "postId" = $1
                        ),
                        "updatedAt" = NOW()
                    WHERE id = $1
                    `,
                    [
                        postId,
                    ]
                );

                return commentRow;
            }
        );

    if (!row) {
        return null;
    }

    await awardForComment(
        String(row.authorDiscordId ?? ""),
        discordId,
        row.id
    );

    return {
        id: row.id,
        postId: row.postId,
        body: row.body,
        createdAt: row.createdAt,
        userId: row.userId,
        discordId: row.discordId,
        username: row.username,
        displayName: row.displayName,
        avatarHash: row.avatarHash,
    };
}
