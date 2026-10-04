const { prisma } = require("./prisma");

/**
 * Read-only bridge between the bot and the Studio database.
 *
 * The bot and the dashboard already share one Postgres database, so the
 * cheapest correct bridge is to read the tables directly instead of calling
 * the dashboard over HTTP: no shared secret to distribute, no second failure
 * mode, and no risk of the bot being talked into a write by a forged response.
 *
 * Two rules keep that safe:
 *
 *   1. Everything here is a read. There is no create/update/delete anywhere in
 *      this module, so a bug in a slash command can never mutate someone's
 *      saved aesthetics or feed.
 *   2. A query is keyed either by a discordId taken from the interaction
 *      itself (interaction.user.id, never a user-supplied argument that could
 *      point at somebody else's rows), or it is scoped to SharedPost rows,
 *      which only exist because their author chose to publish them. Another
 *      account's private SavedAesthetic rows are never readable through this
 *      module, so /remix works on published posts rather than on other people's
 *      libraries.
 *
 * The dashboard's own lib/ modules are TypeScript and depend on Next.js
 * request context, so they cannot be imported here. These queries are
 * deliberately narrower versions of what those modules do.
 */

const MAX_LIST_ROWS = 10;
const MAX_DISCOVER_ROWS = 5;
const FEED_SIZE_PROBE = 200;

function toIsoDay(date) {
    return new Date(date).toISOString().slice(0, 10);
}

/**
 * Resolves a discordId to the internal User id, or null when the account has
 * never opened Studio. Every owner-scoped query below starts this way, so a
 * user who has never signed in gets an empty result rather than an error.
 */
async function resolveInternalUserId(discordId) {
    if (!discordId) {
        return null;
    }

    const user = await prisma.user.findUnique({
        where: { discordId },
        select: { id: true },
    });

    return user?.id ?? null;
}

const POST_FIELDS = {
    id: true,
    itemType: true,
    itemId: true,
    caption: true,
    tags: true,
    likeCount: true,
    commentCount: true,
    createdAt: true,
};

const POST_AUTHOR_SELECT = {
    select: {
        discordId: true,
        username: true,
        displayName: true,
    },
};

/**
 * The caller's saved aesthetics and palettes, newest first.
 *
 * Both lists come back together because /saved renders them in one embed;
 * splitting them into two calls would double the round trips for no gain.
 */
async function getSavedLibrary(discordId) {
    const internalUserId = await resolveInternalUserId(discordId);

    if (!internalUserId) {
        return { aesthetics: [], palettes: [], profileCount: 0 };
    }

    const [aesthetics, palettes, profileCount] = await Promise.all([
        prisma.savedAesthetic.findMany({
            where: { userId: internalUserId },
            orderBy: { updatedAt: "desc" },
            take: MAX_LIST_ROWS,
            select: {
                name: true,
                aestheticId: true,
                moodId: true,
                palette: true,
                usernameIdea: true,
                remixedFromPostId: true,
                updatedAt: true,
            },
        }),
        prisma.savedPalette.findMany({
            where: { userId: internalUserId },
            orderBy: { updatedAt: "desc" },
            take: MAX_LIST_ROWS,
            select: {
                name: true,
                colors: true,
                aestheticId: true,
                updatedAt: true,
            },
        }),
        prisma.profile.count({ where: { userId: internalUserId } }),
    ]);

    return { aesthetics, palettes, profileCount };
}

/**
 * The caller's own posts in the public Discover feed.
 */
async function getMySharedPosts(discordId) {
    const internalUserId = await resolveInternalUserId(discordId);

    if (!internalUserId) {
        return [];
    }

    return prisma.sharedPost.findMany({
        where: { userId: internalUserId },
        orderBy: { createdAt: "desc" },
        take: MAX_LIST_ROWS,
        select: POST_FIELDS,
    });
}

/**
 * A slice of the public feed for /discover.
 *
 * "popular" ranks by likes then recency; "new" is newest first. No viewer is
 * involved, so nothing here can leak private data: a SharedPost row only
 * exists because its author published it.
 */
async function getDiscoverPosts(sort = "new") {
    return prisma.sharedPost.findMany({
        orderBy:
            sort === "popular"
                ? [{ likeCount: "desc" }, { createdAt: "desc" }]
                : [{ createdAt: "desc" }],
        take: MAX_DISCOVER_ROWS,
        select: {
            ...POST_FIELDS,
            user: POST_AUTHOR_SELECT,
        },
    });
}

/**
 * Finds published posts matching a /remix query.
 *
 * Accepts a post id (the id the dashboard puts in a post URL) or free text
 * matched against caption, tags and item id. Only SharedPost rows are
 * searched, which is what keeps this safe: somebody else's unpublished saved
 * aesthetic cannot be pulled out of the database by guessing its name.
 */
async function findPublishedPosts(query) {
    const needle = String(query || "").trim();

    if (!needle) {
        return [];
    }

    const exact = await prisma.sharedPost.findUnique({
        where: { id: needle },
        select: { ...POST_FIELDS, user: POST_AUTHOR_SELECT },
    });

    if (exact) {
        return [exact];
    }

    const tag = needle.replace(/^#/, "").toLowerCase();

    return prisma.sharedPost.findMany({
        where: {
            OR: [
                { caption: { contains: needle, mode: "insensitive" } },
                { tags: { has: tag } },
                { itemId: { equals: needle, mode: "insensitive" } },
            ],
        },
        orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
        take: MAX_DISCOVER_ROWS,
        select: { ...POST_FIELDS, user: POST_AUTHOR_SELECT },
    });
}

/**
 * One published post plus the palette needed to remix it.
 *
 * AESTHETIC and PALETTE posts resolve to their stored colours. The other item
 * types are dashboard-only, so they come back resolvable: false and the
 * command says so instead of inventing colours.
 */
async function getRemixablePost(postId) {
    const post = await prisma.sharedPost.findUnique({
        where: { id: postId },
        select: { ...POST_FIELDS, user: POST_AUTHOR_SELECT },
    });

    if (!post) {
        return null;
    }

    const authorId = post.user?.discordId
        ? await resolveInternalUserId(post.user.discordId)
        : null;

    let palette = [];
    let symbols = [];

    if (authorId && post.itemType === "AESTHETIC") {
        const saved = await prisma.savedAesthetic.findFirst({
            where: { userId: authorId, id: post.itemId },
            select: { palette: true, symbols: true },
        });

        palette = saved?.palette ?? [];
        symbols = saved?.symbols ?? [];
    } else if (authorId && post.itemType === "PALETTE") {
        const saved = await prisma.savedPalette.findFirst({
            where: { userId: authorId, id: post.itemId },
            select: { colors: true },
        });

        palette = saved?.colors ?? [];
    }

    const remixCount = await prisma.savedAesthetic.count({
        where: { remixedFromPostId: post.id },
    });

    return {
        post,
        palette,
        symbols,
        remixCount,
        resolvable: palette.length > 0,
    };
}

/**
 * The caller's own creator numbers, for /analytics.
 *
 * Deliberately only the caller's: the dashboard's analytics page is scoped the
 * same way, and there is no by-discordId variant here for the same reason a
 * command argument could otherwise be pointed at anyone.
 */
async function getCreatorStats(discordId) {
    const internalUserId = await resolveInternalUserId(discordId);

    if (!internalUserId) {
        return null;
    }

    const posts = await prisma.sharedPost.findMany({
        where: { userId: internalUserId },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            likeCount: true,
            commentCount: true,
            createdAt: true,
        },
    });

    const postIds = posts.map((post) => post.id);

    const [
        viewsAgg,
        distinctViewers,
        remixAesthetics,
        remixPalettes,
        savedCount,
    ] = await Promise.all([
        postIds.length
            ? prisma.sharedPostView.aggregate({
                  where: { postId: { in: postIds } },
                  _sum: { views: true },
              })
            : Promise.resolve({ _sum: { views: 0 } }),
        postIds.length
            ? prisma.sharedPostView.groupBy({
                  by: ["userId"],
                  where: { postId: { in: postIds } },
              })
            : Promise.resolve([]),
        prisma.savedAesthetic.count({
            where: { remixedFromUserId: internalUserId },
        }),
        prisma.savedPalette.count({
            where: { remixedFromUserId: internalUserId },
        }),
        prisma.savedAesthetic.count({ where: { userId: internalUserId } }),
    ]);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return {
        postCount: posts.length,
        likes: posts.reduce((sum, post) => sum + post.likeCount, 0),
        comments: posts.reduce((sum, post) => sum + post.commentCount, 0),
        views: viewsAgg._sum.views || 0,
        reach: distinctViewers.length,
        remixes: remixAesthetics + remixPalettes,
        savedCount,
        recentPostCount: posts.filter(
            (post) => new Date(post.createdAt).getTime() >= thirtyDaysAgo
        ).length,
        oldestPostAt: posts.length ? posts[0].createdAt : null,
    };
}

/**
 * The server's usage numbers, for /serverstats.
 *
 * Reads GuildUsageEvent rows, which the interaction pipeline writes after
 * every successful command. Only rows tagged with this guild id are counted,
 * and only aggregates leave the function.
 */
async function getServerUsage(discordGuildId, { days = 30 } = {}) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.guildUsageEvent.findMany({
        where: { guildId: discordGuildId, createdAt: { gte: since } },
        select: {
            commandName: true,
            discordUserId: true,
            premium: true,
            createdAt: true,
        },
    });

    const byCommand = new Map();
    const byMember = new Map();
    const byDay = new Map();
    let premiumEvents = 0;

    for (const row of rows) {
        byCommand.set(
            row.commandName,
            (byCommand.get(row.commandName) || 0) + 1
        );
        byMember.set(
            row.discordUserId,
            (byMember.get(row.discordUserId) || 0) + 1
        );

        const day = toIsoDay(row.createdAt);
        byDay.set(day, (byDay.get(day) || 0) + 1);

        if (row.premium) {
            premiumEvents += 1;
        }
    }

    return {
        days,
        totalEvents: rows.length,
        uniqueMembers: byMember.size,
        premiumEvents,
        topCommands: [...byCommand.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
        topMembers: [...byMember.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
        busiestDay: [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] || null,
    };
}

/**
 * Rough feed size for the /discover footer.
 *
 * Probes FEED_SIZE_PROBE + 1 rows rather than counting the table, so the
 * command reports "200+" past that point instead of paying for a full scan.
 */
async function countFeedPosts() {
    const rows = await prisma.sharedPost.findMany({
        select: { id: true },
        take: FEED_SIZE_PROBE + 1,
    });

    return {
        count: Math.min(rows.length, FEED_SIZE_PROBE),
        capped: rows.length > FEED_SIZE_PROBE,
        probe: FEED_SIZE_PROBE,
    };
}

module.exports = {
    resolveInternalUserId,
    getSavedLibrary,
    getMySharedPosts,
    getDiscoverPosts,
    findPublishedPosts,
    getRemixablePost,
    getCreatorStats,
    getServerUsage,
    countFeedPosts,
    MAX_LIST_ROWS,
    MAX_DISCOVER_ROWS,
};