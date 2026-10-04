import {
    query,
} from "./database";

import {
    normalizeDiscordId,
} from "./creatorHref";

/**
 * Creator analytics (Phase 7).
 *
 * Two halves live here. `recordPostView` is the write path, called when a
 * signed-in user actually looks at someone else's post. `getCreatorAnalytics`
 * is the read path behind /dashboard/analytics.
 *
 * The important design decision is that a "view" is a *person*, not an
 * impression. "SharedPostView" keeps one row per (post, viewer) and bumps a
 * counter on it, so the same table answers both "how many people saw this"
 * and "how many times was it seen" without ever letting one refreshed tab
 * invent an audience. See the model's doc comment in prisma/schema.prisma.
 *
 * Everything here is scoped to the author's own rows. There is no
 * by-discordId variant of the read path that a caller could point at another
 * user, because the page is only ever about the signed-in account.
 */

const MAX_POST_ROWS = 50;
const MAX_TREND_DAYS = 90;

export type ViewOutcome =
    /** Recorded, or already recorded earlier in this window. */
    | "recorded"
    /** The post does not exist (or was unshared mid-scroll). */
    | "not-found"
    /** The viewer is the author, so the view would be self-congratulation. */
    | "self";

export type AnalyticsTotals = {
    postCount: number;

    /** Distinct signed-in accounts that saw the work. */
    reach: number;

    /** Total impressions, including repeat views by the same account. */
    views: number;

    likes: number;
    comments: number;
    remixes: number;

    /** Accounts that engaged (liked, commented or remixed) but said nothing else. */
    engagers: number;
};

export type AnalyticsPostRow = {
    postId: string;
    itemType: string;
    itemId: string;

    caption: string | null;
    createdAt: Date;

    reach: number;
    views: number;
    likes: number;
    comments: number;
    remixes: number;

    /** Impressions in the window being reported. */
    windowViews: number;
};

export type AnalyticsTrendPoint = {
    day: string;
    views: number;
    reach: number;
};

export type CreatorAnalytics = {
    totals: AnalyticsTotals;
    posts: AnalyticsPostRow[];
    trend: AnalyticsTrendPoint[];

    /** When the account's oldest recorded view is, for "since" copy. */
    firstViewAt: Date | null;
};

/**
 * Notes that `viewerDiscordId` looked at `postId`.
 *
 * Deliberately cheap and deliberately forgiving. It runs on feed scroll, so
 * a single upsert is the whole cost, and a failure must never surface to the
 * reader — the caller is not waiting on an answer. The route swallows errors;
 * this function only refuses to write nonsense.
 *
 * The author check happens in SQL rather than with a second round trip: the
 * `NOT EXISTS` below is what stops a creator from being their own audience.
 */
export async function recordPostView(
    postId: string,
    viewerDiscordId: string
): Promise<ViewOutcome> {
    const viewerId =
        normalizeDiscordId(viewerDiscordId);

    if (!viewerId || !postId) {
        return "not-found";
    }

    const result =
        await query<{ id: string }>(
            `
            INSERT INTO "SharedPostView" (
                "userId",
                "postId",
                "views",
                "firstViewAt",
                "lastViewAt"
            )
            SELECT viewer.id,
                   post.id,
                   1,
                   NOW(),
                   NOW()
            FROM (
                SELECT id
                FROM "User"
                WHERE "discordId" = $2
                LIMIT 1
            ) viewer
            CROSS JOIN (
                SELECT sp.id, sp."userId"
                FROM "SharedPost" sp
                WHERE sp.id = $1
                LIMIT 1
            ) post
            /*
             * A post whose author has no Studio row cannot exist (posts are
             * keyed to a User id), but the guard also makes the intent
             * explicit: never credit the author with watching their own work.
             */
            WHERE post."userId" <> viewer.id
            ON CONFLICT ("userId", "postId")
            DO UPDATE
            SET "views" = "SharedPostView"."views" + 1,
                "lastViewAt" = NOW()
            RETURNING "postId" AS "id"
            `,
            [
                postId,
                viewerId,
            ]
        );

    if (result.rows.length > 0) {
        return "recorded";
    }

    /*
     * Nothing was written. Either the post is gone or the viewer is the
     * author, and the caller treats both as "do nothing", so distinguishing
     * them costs a query nobody needs. It is answered from the post lookup
     * alone, which is one cheap read on a path that only runs when a card
     * scrolls into view for the first time.
     */
    const post =
        await query<{ "authorDiscordId": string | null }>(
            `
            SELECT au."discordId" AS "authorDiscordId"
            FROM "SharedPost" sp
            LEFT JOIN "User" au
                ON au.id = sp."userId"
            WHERE sp.id = $1
            LIMIT 1
            `,
            [
                postId,
            ]
        );

    const author =
        post.rows[0]?.authorDiscordId;

    if (!author) {
        return "not-found";
    }

    return author === viewerId
        ? "self"
        : "not-found";
}

/**
 * Everything /dashboard/analytics shows, for one account, over a window.
 *
 * The window filters views and the trend, but not the lifetime totals: a
 * creator who published last month still wants to know they have 40 likes
 * even when they are looking at the last 7 days. `windowViews` on each row
 * is the figure that does move with the window.
 *
 * Remixes are counted from the library rather than the feed, matching
 * `getCreatorProfile` — a remix the other person never published still
 * happened.
 */
export async function getCreatorAnalytics(
    rawDiscordId: string,
    options: {
        days?: number;
    } = {}
): Promise<CreatorAnalytics | null> {
    const discordId =
        normalizeDiscordId(rawDiscordId);

    if (!discordId) {
        return null;
    }

    /*
     * `Number.isFinite` before anything else: `Math.floor(NaN)` is NaN and
     * NaN survives both clamps, which would bind a NaN into a `::int`
     * placeholder and throw. The page only ever passes a whitelisted number,
     * but this is a public helper.
     */
    const requested = options.days ?? 30;

    const days = Math.min(
        Math.max(
            Math.floor(
                Number.isFinite(requested) ? requested : 30
            ),
            1
        ),
        MAX_TREND_DAYS
    );

    const account =
        await query<{ id: string }>(
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

    const userId =
        account.rows[0]?.id;

    if (!userId) {
        return null;
    }

    /*
     * Only the per-post window column and the trend take `days`. The totals
     * are lifetime figures on purpose — a creator who published last month
     * still has the same number of likes when they switch to "last 7 days".
     */
    const [
        totals,
        posts,
        trend,
    ] = await Promise.all([
        readTotals(userId),
        readPosts(userId, days),
        readTrend(userId, days),
    ]);

    return {
        totals: totals.totals,
        posts,
        trend,
        firstViewAt: totals.firstViewAt,
    };
}

async function readTotals(
    userId: string
): Promise<{
    totals: AnalyticsTotals;
    firstViewAt: Date | null;
}> {
    const result =
        await query<AnalyticsTotals & {
            firstViewAt: Date | null;
        }>(
            `
            SELECT
                COALESCE(posts."postCount", 0)::int AS "postCount",
                COALESCE(views."reach", 0)::int AS "reach",
                COALESCE(views."views", 0)::int AS "views",
                COALESCE(posts."likes", 0)::int AS "likes",
                COALESCE(posts."comments", 0)::int AS "comments",
                COALESCE(remixes."remixes", 0)::int AS "remixes",
                COALESCE(engagers."engagers", 0)::int AS "engagers",
                views."firstViewAt" AS "firstViewAt"
            FROM (SELECT 1) seed
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::bigint AS "postCount",
                    COALESCE(SUM("likeCount"), 0)::bigint AS "likes",
                    COALESCE(SUM("commentCount"), 0)::bigint AS "comments"
                FROM "SharedPost"
                WHERE "userId" = $1
            ) posts ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::bigint AS "reach",
                    COALESCE(SUM(v."views"), 0)::bigint AS "views",
                    MIN(v."firstViewAt") AS "firstViewAt"
                FROM "SharedPostView" v
                INNER JOIN "SharedPost" sp
                    ON sp.id = v."postId"
                WHERE sp."userId" = $1
            ) views ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM "SavedAesthetic" sa
                        WHERE sa."remixedFromUserId" = $1
                    )
                    +
                    (
                        SELECT COUNT(*)
                        FROM "SavedPalette" spal
                        WHERE spal."remixedFromUserId" = $1
                    ) AS "remixes"
            ) remixes ON TRUE
            /*
             * Distinct accounts that did something other than look. Compared
             * against "reach" this is the conversion rate the page shows, so
             * it counts likes, comments and remixes over the whole lifetime
             * like the numbers it is divided by.
             */
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT actor."id")::bigint AS "engagers"
                FROM (
                    SELECT l."userId" AS "id"
                    FROM "SharedPostLike" l
                    INNER JOIN "SharedPost" sp
                        ON sp.id = l."postId"
                    WHERE sp."userId" = $1

                    UNION

                    SELECT c."userId"
                    FROM "SharedPostComment" c
                    INNER JOIN "SharedPost" sp
                        ON sp.id = c."postId"
                    WHERE sp."userId" = $1

                    UNION

                    SELECT sa."userId"
                    FROM "SavedAesthetic" sa
                    WHERE sa."remixedFromUserId" = $1

                    UNION

                    SELECT spal."userId"
                    FROM "SavedPalette" spal
                    WHERE spal."remixedFromUserId" = $1
                ) actor
            ) engagers ON TRUE
            `,
            [
                userId,
            ]
        );

    const row = result.rows[0];

    if (!row) {
        return {
            totals: {
                postCount: 0,
                reach: 0,
                views: 0,
                likes: 0,
                comments: 0,
                remixes: 0,
                engagers: 0,
            },
            firstViewAt: null,
        };
    }

    return {
        totals: {
            postCount: row.postCount,
            reach: row.reach,
            views: row.views,
            likes: row.likes,
            comments: row.comments,
            remixes: row.remixes,
            engagers: row.engagers,
        },
        firstViewAt:
            row.firstViewAt ?? null,
    };
}

async function readPosts(
    userId: string,
    days: number
): Promise<AnalyticsPostRow[]> {
    const result =
        await query<AnalyticsPostRow>(
            `
            SELECT
                sp.id AS "postId",
                sp."itemType"::text AS "itemType",
                sp."itemId" AS "itemId",
                sp.caption AS "caption",
                sp."createdAt" AS "createdAt",

                COALESCE(v."reach", 0)::int AS "reach",
                COALESCE(v."views", 0)::int AS "views",
                sp."likeCount"::int AS "likes",
                sp."commentCount"::int AS "comments",
                COALESCE(r."remixes", 0)::int AS "remixes",
                COALESCE(w."windowViews", 0)::int AS "windowViews"
            FROM "SharedPost" sp
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*)::bigint AS "reach",
                    COALESCE(SUM(vv."views"), 0)::bigint AS "views"
                FROM "SharedPostView" vv
                WHERE vv."postId" = sp.id
            ) v ON TRUE
            LEFT JOIN LATERAL (
                /*
                 * Summed, not counted: one person who looked four times in
                 * the window is four impressions, matching the "Views"
                 * column it sits beside. Approximate in the same direction
                 * as the trend — the row only remembers its most recent
                 * view, so all of a viewer's impressions land in the window
                 * if their latest one is inside it.
                 */
                SELECT COALESCE(SUM(vw."views"), 0)::bigint AS "windowViews"
                FROM "SharedPostView" vw
                WHERE
                    vw."postId" = sp.id
                    AND vw."lastViewAt" >=
                        NOW() - ($2::int * INTERVAL '1 day')
            ) w ON TRUE            LEFT JOIN LATERAL (
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM "SavedAesthetic" sa
                        WHERE sa."remixedFromPostId" = sp.id
                    )
                    +
                    (
                        SELECT COUNT(*)
                        FROM "SavedPalette" spal
                        WHERE spal."remixedFromPostId" = sp.id
                    ) AS "remixes"
            ) r ON TRUE
            WHERE sp."userId" = $1
            ORDER BY
                COALESCE(v."views", 0) DESC,
                sp."createdAt" DESC
            LIMIT $3
            `,
            [
                userId,
                days,
                MAX_POST_ROWS,
            ]
        );

    return result.rows;
}

/**
 * Daily impressions and new-audience counts.
 *
 * Bucketed on `firstViewAt` for reach and on `lastViewAt` for impressions,
 * which is approximate for the latter by design: the row only remembers its
 * most recent view, so a viewer who looked on Monday and again on Thursday
 * lands in Thursday's bucket twice. A per-impression log would fix that at
 * the cost of the only table on this page that grows without bound. Reach is
 * the number the page leans on, and reach is exact.
 */
async function readTrend(
    userId: string,
    days: number
): Promise<AnalyticsTrendPoint[]> {
    const result =
        await query<AnalyticsTrendPoint>(
            `
            SELECT
                bucket.day::text AS "day",
                COALESCE(views."views", 0)::int AS "views",
                COALESCE(reach."reach", 0)::int AS "reach"
            FROM (
                SELECT
                    (
                        DATE_TRUNC('day', NOW())
                        - (make_interval(days => d.n))
                    )::date AS day
                /*
                 * Ascending, with the offset subtracted: generate_series
                 * (29, 0, 1) is empty because the start is already past the
                 * end, which silently returned a trend of zero buckets
                 * instead of thirty.
                 */
                FROM generate_series(
                    0,
                    $2::int - 1,
                    1
                ) AS d(n)
            ) bucket
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(v."views"), 0)::bigint AS "views"
                FROM "SharedPostView" v
                INNER JOIN "SharedPost" sp
                    ON sp.id = v."postId"
                WHERE
                    sp."userId" = $1
                    AND DATE_TRUNC('day', v."lastViewAt")::date = bucket.day
            ) views ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::bigint AS "reach"
                FROM "SharedPostView" v
                INNER JOIN "SharedPost" sp
                    ON sp.id = v."postId"
                WHERE
                    sp."userId" = $1
                    AND DATE_TRUNC('day', v."firstViewAt")::date = bucket.day
            ) reach ON TRUE
            ORDER BY bucket.day ASC
            `,
            [
                userId,
                days,
            ]
        );

    return result.rows;
}
