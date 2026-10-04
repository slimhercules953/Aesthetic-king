import {
    getAssetSets,
} from "./assetCatalog";

import {
    query,
} from "./database";

import {
    FEED_SELECT_SQL,
    type SharedItemType,
    type SharedPostSummary,
} from "./sharedFeed";

/*
 * Public search over the Discover feed.
 *
 * `search.ts` answers "what have *I* saved". This answers "what has the
 * community published", which is a different question with different rules:
 * every row here belongs to somebody else, so only content that was
 * explicitly pushed to the feed is searchable, and the term is never
 * concatenated into SQL — it is always a bound parameter.
 *
 * What a term can match:
 *
 *   - the caption and tags the author chose
 *   - the author's Studio username or display name
 *   - the item itself — a saved aesthetic's name/aesthetic/mood, a palette's
 *     name or any of its hex colors, or an asset set's catalog facets
 *
 * The asset catalog is bundled JSON rather than a table, so asset sets are
 * matched in-process and their ids are handed to the query as an array.
 * That keeps one definition of "does this set match a term" instead of
 * inventing a second one in SQL.
 */

export const MIN_FEED_SEARCH_LENGTH = 2;
export const MAX_FEED_SEARCH_LENGTH = 64;

export type FeedSearchOptions = {
    itemType?: SharedItemType | null;
    tag?: string | null;
    sort?: "recent" | "popular";
    limit?: number;
    offset?: number;
    /** See the same option on `getFeedPosts`. */
    authorDiscordId?: string | null;
};

export type CreatorHit = {
    discordId: string;
    username: string | null;
    displayName: string | null;
    avatarHash: string | null;
    postCount: number;
    likesReceived: number;
};

export function normalizeFeedSearchTerm(
    raw: string | null | undefined
): string | null {
    const term =
        (raw ?? "")
            .trim()
            .slice(0, MAX_FEED_SEARCH_LENGTH);

    return term.length >= MIN_FEED_SEARCH_LENGTH
        ? term
        : null;
}

/**
 * `ILIKE` wildcards in a term are not dangerous — a stray `%` only makes
 * the search broad — but `_` and `%` in a term like "pastel_" silently
 * reading as wildcards is surprising, and `\` would swallow the next
 * character. They are escaped so a term means what was typed.
 */
export function escapeLike(
    value: string
): string {
    return value.replace(
        /[\\%_]/g,
        (match) => `\\${match}`
    );
}

export function feedSearchPattern(
    term: string
): string {
    return `%${escapeLike(term)}%`;
}

/**
 * Catalog sets whose facets mention the term. Mirrors the matching rules in
 * `search.ts` so "cozy" finds the same sets in both places.
 */
export function matchingAssetSetIds(
    term: string
): string[] {
    const needle =
        term.toLowerCase();

    return getAssetSets()
        .filter((set) => {
            if (
                set.id
                    .toLowerCase()
                    .includes(needle)
            ) {
                return true;
            }

            return [
                ...set.aesthetics,
                ...set.moods,
                ...(set.colors ?? []),
                ...(set.tags ?? []),
            ].some((value) =>
                value
                    .toLowerCase()
                    .includes(needle)
            );
        })
        .map((set) => set.id);
}

/**
 * The match itself, as a standalone fragment so it can be asserted
 * separately from the paging around it.
 *
 * Each branch is guarded by its own item type. That matters more than it
 * looks: the joins are `LEFT JOIN`s, so writing "the joined row exists OR
 * the caption matches" would make every aesthetic and palette post match
 * every term. Guarding per branch means a term only reaches the columns it
 * can actually mean, and a post whose item has been deleted matches nothing
 * and drops out of search rather than turning up as a card with no media.
 */
export const FEED_SEARCH_MATCH_SQL = `
    (
        (
            sp."itemType" = 'AESTHETIC'
            AND sa.id IS NOT NULL
            AND (
                sa.name ILIKE $2
                OR sa."aestheticId" ILIKE $2
                OR sa."moodId" ILIKE $2
                OR sa."profileSetId" = ANY($3::text[])
            )
        )
        OR (
            sp."itemType" = 'PALETTE'
            AND spal.id IS NOT NULL
            AND (
                spal.name ILIKE $2
                OR EXISTS (
                    SELECT 1
                    FROM unnest(spal.colors) AS c(hex)
                    WHERE c.hex ILIKE $2
                )
            )
        )
        OR (
            sp."itemType" = 'ASSET'
            AND sp."itemId" = ANY($3::text[])
        )
        OR (
            sp."itemType" = 'PROFILE'
            AND pr.id IS NOT NULL
            AND (
                pr.name ILIKE $2
                OR pr.username ILIKE $2
                OR pr.bio ILIKE $2
                OR pr.status ILIKE $2
                OR pr."profileSetId" = ANY($3::text[])
            )
        )
        OR (
            sp."itemType" = 'PACK'
            AND apk.id IS NOT NULL
            AND (
                apk.name ILIKE $2
                OR apk.description ILIKE $2
                OR apk."aestheticId" ILIKE $2
                OR apk."moodId" ILIKE $2
                OR EXISTS (
                    SELECT 1
                    FROM unnest(apk.colors) AS pc(hex)
                    WHERE pc.hex ILIKE $2
                )
            )
        )
        OR sp.caption ILIKE $2
        OR EXISTS (
            SELECT 1
            FROM unnest(sp.tags) AS t(tag)
            WHERE t.tag ILIKE $2
        )
        OR u.username ILIKE $2
        OR u."displayName" ILIKE $2
    )
`;

/**
 * Builds the statement without running it, so the shape of the SQL can be
 * asserted offline. `$1` is the viewer (the like-detection subquery in
 * `FEED_SELECT_SQL` needs it), `$2` the ILIKE pattern, `$3` the matching
 * catalog set ids; then the type filter, limit and offset.
 */
export function buildFeedSearchQuery(
    term: string,
    viewerDiscordId: string | null,
    options: FeedSearchOptions = {}
): {
    text: string;
    params: unknown[];
} {
    const params: unknown[] = [
        viewerDiscordId,
        feedSearchPattern(term),
        matchingAssetSetIds(term),
    ];

    let filterSql = "";

    if (options.authorDiscordId) {
        params.push(options.authorDiscordId);
        filterSql +=
            ` AND u."discordId" = $${params.length}`;
    }

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

    params.push(
        Math.min(
            Math.max(options.limit ?? 18, 1),
            60
        )
    );
    const limitParam = `$${params.length}`;

    params.push(
        Math.max(options.offset ?? 0, 0)
    );
    const offsetParam = `$${params.length}`;

    const text = `
        ${FEED_SELECT_SQL}

        LEFT JOIN "SavedAesthetic" sa
            ON sp."itemType" = 'AESTHETIC'
            AND sa.id = sp."itemId"

        LEFT JOIN "SavedPalette" spal
            ON sp."itemType" = 'PALETTE'
            AND spal.id = sp."itemId"

        LEFT JOIN "Profile" pr
            ON sp."itemType" = 'PROFILE'
            AND pr.id = sp."itemId"

        LEFT JOIN "AestheticPack" apk
            ON sp."itemType" = 'PACK'
            AND apk.id = sp."itemId"

        WHERE ${FEED_SEARCH_MATCH_SQL}
        ${filterSql}
        ${
            options.sort === "popular"
                ? `ORDER BY sp."likeCount" DESC, sp."createdAt" DESC`
                : `ORDER BY sp."createdAt" DESC`
        }
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
    `;

    return {
        text,
        params,
    };
}

/**
 * Feed posts matching a term, in the same shape `getFeedPosts` returns so
 * the Discover grid can hydrate and render either source identically.
 *
 * The per-branch guards in `FEED_SEARCH_MATCH_SQL` are what keeps this
 * honest: a post whose underlying item has since been deleted has no row to
 * match on, so it drops out of search results instead of turning up as a
 * card with no media.
 */
export async function searchFeedPosts(
    rawTerm: string | null | undefined,
    viewerDiscordId: string | null,
    options: FeedSearchOptions = {}
): Promise<SharedPostSummary[]> {
    const term =
        normalizeFeedSearchTerm(rawTerm);

    if (!term) {
        return [];
    }

    const { text, params } =
        buildFeedSearchQuery(
            term,
            viewerDiscordId,
            options
        );

    const result =
        await query<SharedPostSummary>(
            text,
            params
        );

    return result.rows;
}

/**
 * Creators whose Studio name — or the tags on their published work — match
 * a term.
 *
 * Deliberately restricted to accounts that have published at least one
 * post: an account that has never shared anything has no public surface, so
 * listing it would leak the existence of a Studio account through a search
 * box.
 */
export async function searchFeedCreators(
    rawTerm: string | null | undefined,
    limit = 5
): Promise<CreatorHit[]> {
    const term =
        normalizeFeedSearchTerm(rawTerm);

    if (!term) {
        return [];
    }

    const result =
        await query<CreatorHit>(
            `
            SELECT
                u."discordId" AS "discordId",
                u.username AS "username",
                u."displayName" AS "displayName",
                u."avatarHash" AS "avatarHash",
                COUNT(sp.id)::int AS "postCount",
                COALESCE(
                    SUM(sp."likeCount"),
                    0
                )::int AS "likesReceived"
            FROM "User" u
            INNER JOIN "SharedPost" sp
                ON sp."userId" = u.id
            WHERE
                u.username ILIKE $1
                OR u."displayName" ILIKE $1
                OR EXISTS (
                    SELECT 1
                    FROM unnest(sp.tags) AS t(tag)
                    WHERE t.tag ILIKE $1
                )
            GROUP BY
                u.id,
                u."discordId",
                u.username,
                u."displayName",
                u."avatarHash"
            ORDER BY
                COUNT(sp.id) DESC,
                MAX(sp."createdAt") DESC
            LIMIT $2
            `,
            [
                feedSearchPattern(term),
                Math.min(
                    Math.max(limit, 1),
                    20
                ),
            ]
        );

    return result.rows;
}
