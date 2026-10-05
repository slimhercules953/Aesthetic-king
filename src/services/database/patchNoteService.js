const {
    prisma,
} = require("./prisma");

/**
 * Read side of the changelog, and the "you have unseen updates" check.
 *
 * `PatchNote` and `PatchNotification` already existed in the schema — the
 * Studio bell reads them — but nothing ever wrote a row and nothing in the
 * bot read them. This service is the bot's half.
 *
 * Two constraints shape it:
 *
 * 1. A `PatchNotification` row is keyed on `userId`, so recording that
 *    someone has seen a note requires a `User` row. Plenty of people use the
 *    bot and have never opened the Studio, so the notice cannot depend on
 *    one existing. `getUnseenPatchNote` therefore answers from a
 *    process-local latch when there is no account, and only the explicit
 *    `/patch-notes` command creates a row (see `markPatchNotesSeen`).
 *
 * 2. This runs on the hot path of every slash command. With no notes
 *    published — the state of a fresh deploy — it must cost effectively
 *    nothing, so the newest note is cached briefly and the per-user query
 *    only happens when a note actually exists.
 */

/** How long the newest-note lookup is reused, in milliseconds. */
const LATEST_CACHE_MS = 60_000;

/**
 * Notes already announced to a given user during this process's lifetime,
 * as `discordId -> version`.
 *
 * Deliberately in memory. Its only job is to stop the same banner being
 * appended to every command for someone who has no Studio account and so
 * cannot persist a dismissal. Restarting the bot re-announces once, which
 * is the correct trade against never telling them at all.
 */
const announced = new Map();

let latestCache = null;
let latestCacheAt = 0;
let latestCached = false;

function toPatchNote(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        version: row.version,
        title: row.title,
        body: row.body,
        publishedAt: row.publishedAt,
    };
}

/**
 * The most recently published note, or null when nothing has been published.
 *
 * `publishedAt <= NOW()` matches the Studio bell's own query so a note
 * dated in the future is hidden from both, rather than nagging from Discord
 * while staying off the site.
 */
async function getLatestPatchNote() {
    const now = Date.now();

    /*
     * `latestCached` rather than `latestCache !== null`, because "there are
     * no notes" is the answer worth caching most: it is the answer on every
     * deployment that has never published one, and it is what makes this
     * cheap enough to call from every command.
     */
    if (latestCached && now - latestCacheAt < LATEST_CACHE_MS) {
        return latestCache;
    }

    const row = await prisma.patchNote.findFirst({
        where: {
            publishedAt: {
                lte: new Date(),
            },
        },
        orderBy: {
            publishedAt: "desc",
        },
    });

    latestCache = toPatchNote(row);
    latestCacheAt = now;
    latestCached = true;

    return latestCache;
}

/**
 * The newest note this user has not seen yet, or null.
 *
 * Null means "say nothing", which is also the answer for any database
 * failure — a changelog banner is never worth failing a command over.
 */
async function getUnseenPatchNote(discordId) {
    if (!discordId) {
        return null;
    }

    let latest;

    try {
        latest = await getLatestPatchNote();
    } catch {
        return null;
    }

    if (!latest) {
        return null;
    }

    const alreadyAnnounced =
        announced.get(discordId) === latest.version;

    if (alreadyAnnounced) {
        return null;
    }

    // Record the announcement before awaiting the lookup so a user firing
    // two commands in parallel is only nagged once.
    announced.set(discordId, latest.version);

    try {
        const dismissal =
            await prisma.patchNotification.findFirst({
                where: {
                    patchId: latest.id,
                    user: {
                        discordId,
                    },
                },
                select: {
                    userId: true,
                },
            });

        if (dismissal) {
            return null;
        }
    } catch {
        // Without a readable ledger the latch above is the only thing
        // preventing a banner on every command, so leave it set.
        return null;
    }

    return latest;
}

/**
 * Newest-first page of published notes, for `/patch-notes`.
 *
 * Bounded by `take`/`skip`; Discord's own payload limits are enforced by the
 * command, not here.
 */
async function listPatchNotes({ take = 5, skip = 0 } = {}) {
    const rows = await prisma.patchNote.findMany({
        where: {
            publishedAt: {
                lte: new Date(),
            },
        },
        orderBy: {
            publishedAt: "desc",
        },
        take,
        skip,
    });

    return rows.map(toPatchNote);
}

/**
 * Total published notes, so the command can tell a bad page number from the
 * last page.
 */
async function countPatchNotes() {
    return prisma.patchNote.count({
        where: {
            publishedAt: {
                lte: new Date(),
            },
        },
    });
}

/**
 * Marks every published note as seen for this user.
 *
 * Called only by `/patch-notes`, which is the one moment we know they
 * actually read it. Creating a `User` row here is deliberate and matches
 * what the save button already does: it is what makes the dismissal
 * permanent and stops the Studio bell repeating a changelog they have
 * already read in Discord.
 */
async function markPatchNotesSeen(discordUser) {
    const discordId = discordUser?.id;

    if (!discordId) {
        return 0;
    }

    const user = await prisma.user.upsert({
        where: {
            discordId,
        },
        update: {},
        create: {
            discordId,
            username:
                discordUser.username ?? null,
            displayName:
                discordUser.globalName ?? null,
            avatarHash:
                discordUser.avatar ?? null,
        },
        select: {
            id: true,
        },
    });

    const notes = await prisma.patchNote.findMany({
        where: {
            publishedAt: {
                lte: new Date(),
            },
        },
        select: {
            id: true,
        },
    });

    if (notes.length === 0) {
        return 0;
    }

    const result =
        await prisma.patchNotification.createMany({
            data: notes.map((note) => ({
                userId: user.id,
                patchId: note.id,
            })),
            skipDuplicates: true,
        });

    // The latch is per-version, so clear it for this user: they have a real
    // dismissal now and a future release should still reach them.
    announced.delete(discordId);

    return result.count;
}

/**
 * Drops the cached newest note. Used by the seed script so a note published
 * while the bot is up is noticed within a command, not a minute later.
 */
function clearPatchNoteCache() {
    latestCache = null;
    latestCacheAt = 0;
}

module.exports = {
    getLatestPatchNote,
    getUnseenPatchNote,
    listPatchNotes,
    countPatchNotes,
    markPatchNotesSeen,
    clearPatchNoteCache,
};
