import {
    query,
} from "./database";

export type SharedItemType =
    | "AESTHETIC"
    | "PALETTE"
    | "ASSET";

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
    username: string | null;
    displayName: string | null;
    avatarHash: string | null;
};

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

export async function shareItemToFeed(
    discordId: string,
    input: {
        itemType: SharedItemType;
        itemId: string;
        caption?: string | null;
        tags?: (string | null | undefined)[];
    }
): Promise<SharedPostSummary> {
    const caption =
        input.caption?.trim() ?? null;

    const tags = normalizeTags(
        input.tags ?? []
    );

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
                input.itemType,
                input.itemId,
                caption,
                tags,
            ]
        );

    const inserted =
        result.rows[0];

    if (!inserted) {
        throw new Error(
            "Unable to share item. Make sure you are signed in."
        );
    }

    const post =
        await getFeedPostById(
            inserted.id,
            discordId
        );

    if (!post) {
        throw new Error(
            "Unable to load the shared post."
        );
    }

    return post;
}

const FEED_SELECT = `
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
            `${FEED_SELECT}
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
            `${FEED_SELECT}
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

export async function getFeedPostsByAuthorDiscordId(
    authorDiscordId: string,
    viewerDiscordId: string | null,
    limit = 30
): Promise<SharedPostSummary[]> {
    const result =
        await query<SharedPostSummary>(
            `${FEED_SELECT}
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

export async function toggleSharedPostLike(
    postId: string,
    discordId: string
): Promise<{
    liked: boolean;
    likeCount: number;
} | null> {
    const result =
        await query<{
            liked: boolean;
            "likeCount": number;
        }>(
            `
            WITH actor AS (
                SELECT id
                FROM "User"
                WHERE "discordId" = $2
                LIMIT 1
            ),
            existing AS (
                DELETE FROM "SharedPostLike" spl
                USING actor
                WHERE
                    spl."postId" = $1
                    AND spl."userId" = actor.id
                RETURNING spl."userId"
            ),
            liked AS (
                INSERT INTO "SharedPostLike" ("userId", "postId", "createdAt")
                SELECT actor.id, $1, NOW()
                FROM actor
                WHERE NOT EXISTS (SELECT 1 FROM existing)
                  AND EXISTS (
                      SELECT 1
                      FROM "SharedPost"
                      WHERE id = $1
                  )
                ON CONFLICT ("userId", "postId") DO NOTHING
                RETURNING "SharedPostLike"."userId"
            ),
            counted AS (
                UPDATE "SharedPost" sp
                SET
                    "likeCount" = (
                        SELECT COUNT(*)::int
                        FROM "SharedPostLike"
                        WHERE "postId" = $1
                    ),
                    "updatedAt" = NOW()
                WHERE sp.id = $1
                RETURNING sp."likeCount"
            )
            SELECT
                (SELECT COUNT(*) > 0 FROM liked) AS liked,
                (SELECT "likeCount" FROM counted) AS "likeCount"
            `,
            [
                postId,
                discordId,
            ]
        );

    const row =
        result.rows[0];

    if (!row) {
        return null;
    }

    return {
        liked: Boolean(row.liked),
        likeCount: Number(row.likeCount ?? 0),
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
        throw new Error(
            "Comment cannot be empty."
        );
    }

    if (trimmed.length > 500) {
        throw new Error(
            "Comment is too long (max 500 characters)."
        );
    }

    const result =
        await query<SharedPostComment>(
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
                WHERE EXISTS (
                    SELECT 1
                    FROM "SharedPost"
                    WHERE id = $1
                )
                RETURNING id, "postId", "userId", body, "createdAt"
            ),
            counted AS (
                UPDATE "SharedPost" sp
                SET
                    "commentCount" = (
                        SELECT COUNT(*)::int
                        FROM "SharedPostComment"
                        WHERE "postId" = $1
                    ),
                    "updatedAt" = NOW()
                WHERE sp.id = $1
                RETURNING sp.id
            )
            SELECT
                spc.id,
                spc."postId",
                spc.body,
                spc."createdAt",
                u.id AS "userId",
                u.username,
                u."displayName",
                u."avatarHash"
            FROM inserted spc
            INNER JOIN "User" u
                ON u.id = spc."userId"
            LIMIT 1
            `,
            [
                postId,
                discordId,
                trimmed,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}
