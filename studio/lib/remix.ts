import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

import {
    isPremiumSet,
} from "./assetCatalog";

import {
    creatorProfileHref,
} from "./creatorHref";

import {
    awardForRemix,
} from "./crownEarning";

import {
    createNotificationForDiscordUser,
} from "./notifications";

import type {
    SharedItemType,
    SharedPostSummary,
} from "./sharedFeed";

/*
 * Remixing with attribution.
 *
 * A remix is an ordinary SavedAesthetic/SavedPalette that also knows which
 * published post it came from. That choice is the whole design: the copy is
 * editable and shareable through the existing paths, attribution survives
 * the remixer never publishing it, and — because the author id is stored
 * next to the post id — it survives the *source* post being unshared.
 *
 * Three rules are enforced here rather than at the call sites, because a
 * remix can be triggered from a card, a detail page or (later) a deep link:
 *
 * **You cannot remix your own work.** It would be a way to collect the
 * `remix_received` award from yourself, and it is not a remix.
 *
 * **Only AESTHETIC and PALETTE posts can be remixed.** An ASSET post points
 * at a catalog set, which is not the poster's work — crediting them for it
 * would be wrong, and saving a set is already what the Asset Explorer does.
 *
 * **The premium check is on the artwork, not the post.** Publishing someone
 * else's premium set is a use of it, so the same entitlement that unlocks
 * saving a set unlocks remixing it. The client hides the button; this does
 * not trust that.
 */

/** Item types a user is allowed to remix. Asset posts point at shared catalog
 *  sets, which are not the poster's own work. */
export const REMIXABLE_ITEM_TYPES: readonly SharedItemType[] = [
    "AESTHETIC",
    "PALETTE",
];

/**
 * Narrows a post's `itemType` to the remixable subset.
 *
 * A plain `.includes()` check does not narrow, because the array is typed as
 * the wider `SharedItemType[]`; this guard is what lets the copy functions
 * take a `RemixablePostRow`.
 */
function isRemixableItemType(
    itemType: SharedItemType
): itemType is RemixableItemType {
    return (
        REMIXABLE_ITEM_TYPES.indexOf(itemType) !== -1
    );
}

export type RemixAttribution = {
    /** The post that was remixed. Null once it has been unshared. */
    sourcePostId: string | null;

    /**
     * The original creator's snowflake. Kept even when the post is gone,
     * which is the reason the column exists.
     */
    sourceDiscordId: string | null;

    sourceUsername: string | null;
    sourceDisplayName: string | null;

    /** Null when the creator's account has been deleted. */
    href: string | null;
};

export type RemixResult = {
    itemType: RemixableItemType;

    /** The new row in the remixer's library. */
    itemId: string;

    name: string;

    attribution: RemixAttribution;
};

/** The subset of `SharedItemType` a copy can be made of. */
type RemixableItemType =
    | "AESTHETIC"
    | "PALETTE";

type SourcePostRow = {
    id: string;
    "itemType": SharedItemType;
    "itemId": string;
    "authorDiscordId": string;
    "authorUsername": string | null;
    "authorDisplayName": string | null;
    "authorUserId": string;
};

/** A post that has already passed the checks in `loadRemixablePost`. */
type RemixablePostRow =
    Omit<SourcePostRow, "itemType"> & {
        "itemType": RemixableItemType;
    };

type SourceAestheticRow = {
    id: string;
    name: string;
    "aestheticId": string;
    "moodId": string | null;
    "colorFilter": string | null;
    "profileSetId": string | null;
    "usernameIdea": string | null;
    bio: string | null;
    status: string | null;
    symbols: string[];
    palette: string[];
};

type SourcePaletteRow = {
    id: string;
    name: string | null;
    "aestheticId": string | null;
    "moodId": string | null;
    colors: string[];
};

/**
 * The name to show in a notice addressed to someone else.
 *
 * Looked up from the actor's own row rather than taken from the post: the
 * post carries the *author's* name, and the author is the person reading the
 * notice. `toggleSharedPostLike` does the same lookup for the same reason.
 */
async function displayNameFor(
    discordId: string
): Promise<string> {
    const result =
        await query<{ name: string | null }>(
            `
            SELECT COALESCE("displayName", "username") AS name
            FROM "User"
            WHERE "discordId" = $1
            LIMIT 1
            `,
            [discordId]
        );

    return (
        String(result.rows[0]?.name ?? "").trim() ||
        "Someone"
    );
}

/**
 * Loads a post and checks it is something this user may remix.
 *
 * Returns the post plus the author's internal id, which the copy needs as
 * `remixedFromUserId`. The return type is narrower than `SharedItemType`
 * because the ASSET branch is refused below — that refusal is what makes the
 * caller's `itemType` exhaustive without each call site re-checking it.
 */
async function loadRemixablePost(
    postId: string,
    remixerDiscordId: string
): Promise<RemixablePostRow> {
    const result =
        await query<SourcePostRow>(
            `
            SELECT
                sp.id,
                sp."itemType",
                sp."itemId",
                u."discordId" AS "authorDiscordId",
                u.username AS "authorUsername",
                u."displayName" AS "authorDisplayName",
                u.id AS "authorUserId"
            FROM "SharedPost" sp
            INNER JOIN "User" u
                ON u.id = sp."userId"
            WHERE sp.id = $1
            LIMIT 1
            `,
            [postId]
        );

    const post =
        result.rows[0];

    if (!post) {
        throw new ExpectedError(
            "That post is no longer in the feed."
        );
    }

    if (post.authorDiscordId === remixerDiscordId) {
        throw new ExpectedError(
            "This is already your work."
        );
    }

    const itemType =
        post.itemType;

    if (!isRemixableItemType(itemType)) {
        throw new ExpectedError(
            "Only aesthetics and palettes can be remixed."
        );
    }

    /*
     * Rebuilding the row is how the narrowed `itemType` reaches the copy
     * functions; narrowing the property alone does not narrow the object.
     */
    return {
        ...post,
        itemType
    };
}

async function remixAesthetic(
    discordId: string,
    post: RemixablePostRow
): Promise<{ itemId: string; name: string }> {
    const result =
        await query<SourceAestheticRow>(
            `
            SELECT
                sa.id,
                sa.name,
                sa."aestheticId",
                sa."moodId",
                sa."colorFilter",
                sa."profileSetId",
                sa."usernameIdea",
                sa.bio,
                sa.status,
                sa.symbols,
                sa.palette
            FROM "SavedAesthetic" sa
            INNER JOIN "User" u
                ON u.id = sa."userId"
            WHERE
                sa.id = $1
                AND u."discordId" = $2
            LIMIT 1
            `,
            [
                post.itemId,
                post.authorDiscordId,
            ]
        );

    const source =
        result.rows[0];

    if (!source) {
        throw new ExpectedError(
            "The original aesthetic is no longer available."
        );
    }

    if (!source.aestheticId) {
        /*
         * `aestheticId` is NOT NULL, so this should be unreachable. It is
         * checked because the copy would otherwise be an aesthetic that no
         * renderer can resolve, and a broken card in someone's library is
         * worse than a refused remix.
         */
        throw new ExpectedError(
            "The original aesthetic is incomplete."
        );
    }

    const inserted =
        await query<{ id: string; name: string }>(
            `
            INSERT INTO "SavedAesthetic" (
                id,
                "userId",
                "generationId",
                name,
                "aestheticId",
                "moodId",
                "colorFilter",
                "profileSetId",
                "usernameIdea",
                bio,
                status,
                symbols,
                palette,
                "remixedFromPostId",
                "remixedFromUserId",
                "createdAt",
                "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                NULL,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                NOW(),
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1
            RETURNING id, name
            `,
            [
                discordId,
                source.name,
                source.aestheticId,
                source.moodId,
                source.colorFilter,
                source.profileSetId,
                source.usernameIdea,
                source.bio,
                source.status,
                source.symbols ?? [],
                source.palette ?? [],
                post.id,
                post.authorUserId,
            ]
        );

    const created =
        inserted.rows[0];

    if (!created) {
        throw new ExpectedError(
            "Unable to remix. Make sure you are signed in."
        );
    }

    return {
        itemId: created.id,
        name: created.name
    };
}

async function remixPalette(
    discordId: string,
    post: RemixablePostRow
): Promise<{ itemId: string; name: string }> {
    const result =
        await query<SourcePaletteRow>(
            `
            SELECT
                sp.id,
                sp.name,
                sp."aestheticId",
                sp."moodId",
                sp.colors
            FROM "SavedPalette" sp
            INNER JOIN "User" u
                ON u.id = sp."userId"
            WHERE
                sp.id = $1
                AND u."discordId" = $2
            LIMIT 1
            `,
            [
                post.itemId,
                post.authorDiscordId,
            ]
        );

    const source =
        result.rows[0];

    if (!source) {
        throw new ExpectedError(
            "The original palette is no longer available."
        );
    }

    const colors = source.colors ?? [];

    if (colors.length < 3) {
        /*
         * `createSavedPalette` refuses anything under three colors, and a
         * copy that cannot be re-saved would be a dead end in the remixer's
         * library. Refusing is honest; silently padding would invent colors.
         */
        throw new ExpectedError(
            "The original palette is too small to remix."
        );
    }

    const inserted =
        await query<{ id: string; name: string | null }>(
            `
            INSERT INTO "SavedPalette" (
                id,
                "userId",
                name,
                "aestheticId",
                "moodId",
                colors,
                "remixedFromPostId",
                "remixedFromUserId",
                "createdAt",
                "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                NOW(),
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1
            RETURNING id, name
            `,
            [
                discordId,
                source.name,
                source.aestheticId,
                source.moodId,
                colors,
                post.id,
                post.authorUserId,
            ]
        );

    const created =
        inserted.rows[0];

    if (!created) {
        throw new ExpectedError(
            "Unable to remix. Make sure you are signed in."
        );
    }

    return {
        itemId: created.id,
        name: created.name ?? "Color palette",
    };
}

/**
 * Copies a published post's item into the remixing user's library.
 *
 * `premiumUnlocked` is the caller's answer to the `PREMIUM_ASSETS` gate. The
 * route asks the entitlement layer for it so it can reply with a proper
 * upsell, and this function refuses again rather than trusting its caller —
 * the same way `toggleSharedPostLike` re-checks `SHARED_FEED_INTERACTION`
 * even though the like route already checked it.
 */
export async function remixFromPost(
    discordId: string,
    postId: string,
    options: { premiumUnlocked: boolean }
): Promise<RemixResult> {
    const post =
        await loadRemixablePost(
            postId,
            discordId
        );

    /*
     * The gate is on the artwork the copy carries, so it is read from the
     * source item rather than from anything on the post.
     */
    const premiumSet =
        await premiumSetForPost(post.id);

    if (premiumSet && !options.premiumUnlocked) {
        throw new ExpectedError(
            "This uses a premium set. Unlock Premium Assets to remix it."
        );
    }

    const created =
        post.itemType === "AESTHETIC"
            ? await remixAesthetic(
                discordId,
                post
            )
            : await remixPalette(
                discordId,
                post
            );

    const attribution: RemixAttribution = {
        sourcePostId: post.id,
        sourceDiscordId: post.authorDiscordId,
        sourceUsername: post.authorUsername,
        sourceDisplayName: post.authorDisplayName,
        href: creatorProfileHref(
            post.authorDiscordId
        ),
    };

    /*
     * Both of these are after the copy exists. Neither may fail the remix:
     * the user's new item is already written, and losing it because a
     * reward or a notice could not be recorded would be a bad trade.
     */
    await awardForRemix(
        post.authorDiscordId,
        discordId,
        post.id
    );

    await createNotificationForDiscordUser(
        post.authorDiscordId,
        {
            type: "REMIX",
            title: `${await displayNameFor(
                discordId
            )} remixed your ${
                post.itemType === "AESTHETIC"
                    ? "aesthetic"
                    : "palette"
            }`,
            body: null,
            href: "/dashboard/discover",
            icon: "Sparkles",
            dedupeKey:
                `remix:${post.id}:${discordId}`,
        }
    );

    return {
        itemType: post.itemType,
        itemId: created.itemId,
        name: created.name,
        attribution,
    };
}

/**
 * The premium set behind a post's artwork, or null.
 *
 * Takes a post id because that is all the route has before the copy exists.
 * It reads the same column the copy reads, so the route's upsell and the
 * lib's refusal cannot disagree about which set is in play.
 *
 * A PALETTE post has no artwork, so it can never be premium-gated; an ASSET
 * post is not remixable at all and is answered by the lib.
 */
export async function premiumSetForPost(
    postId: string
): Promise<string | null> {
    const result =
        await query<{
            "profileSetId": string | null;
        }>(
            `
            SELECT sa."profileSetId"
            FROM "SharedPost" sp
            INNER JOIN "SavedAesthetic" sa
                ON sa.id = sp."itemId"
            WHERE
                sp.id = $1
                AND sp."itemType" = 'AESTHETIC'
            LIMIT 1
            `,
            [postId]
        );

    const setId =
        result.rows[0]?.profileSetId ??
        null;

    if (!setId || !isPremiumSet(setId)) {
        return null;
    }

    return setId;
}

export type PostAttribution = {
    /** The post being displayed. */
    postId: string;

    /**
     * The post it was remixed from. Null once the original has been unshared
     * — the credit outlives the post, which is the entire reason the author
     * id is stored on the copy instead of being joined through the post.
     */
    sourcePostId: string | null;

    sourceDiscordId: string;
    sourceUsername: string | null;
    sourceDisplayName: string | null;
};

/**
 * Attribution for a page of feed posts, in one query.
 *
 * A feed card shows "Remixed from @x" only when the item it renders was
 * itself a remix, so this maps *displayed* post id → the original creator.
 *
 * Provenance is read through the item tables rather than stored on
 * `SharedPost`, because the copy is the thing that knows where it came from
 * and duplicating that onto the post would be a second place for the fact to
 * go stale. The source post is joined with `LEFT JOIN` on purpose: an
 * unshared original must remove the link, not the credit.
 */
export async function getAttributionsForPosts(
    posts: Pick<
        SharedPostSummary,
        "id" | "itemType" | "itemId"
    >[]
): Promise<Map<string, PostAttribution>> {
    const empty =
        new Map<string, PostAttribution>();

    const remixable = posts.filter(
        (post) =>
            REMIXABLE_ITEM_TYPES.includes(
                post.itemType
            )
    );

    if (remixable.length === 0) {
        return empty;
    }

    const aestheticIds = remixable
        .filter(
            (post) =>
                post.itemType === "AESTHETIC"
        )
        .map(
            (post) => post.itemId
        );

    const paletteIds = remixable
        .filter(
            (post) =>
                post.itemType === "PALETTE"
        )
        .map(
            (post) => post.itemId
        );

    const result =
        await query<PostAttribution>(
            `
            SELECT
                sp.id AS "postId",
                sa."remixedFromPostId" AS "sourcePostId",
                su."discordId" AS "sourceDiscordId",
                su.username AS "sourceUsername",
                su."displayName" AS "sourceDisplayName"
            FROM "SharedPost" sp
            INNER JOIN "SavedAesthetic" sa
                ON sa.id = sp."itemId"
            INNER JOIN "User" su
                ON su.id = sa."remixedFromUserId"
            WHERE
                sp."itemType" = 'AESTHETIC'
                AND sp."itemId" = ANY($1::text[])
                AND sa."remixedFromUserId" IS NOT NULL

            UNION ALL

            SELECT
                sp.id AS "postId",
                spal."remixedFromPostId" AS "sourcePostId",
                su."discordId" AS "sourceDiscordId",
                su.username AS "sourceUsername",
                su."displayName" AS "sourceDisplayName"
            FROM "SharedPost" sp
            INNER JOIN "SavedPalette" spal
                ON spal.id = sp."itemId"
            INNER JOIN "User" su
                ON su.id = spal."remixedFromUserId"
            WHERE
                sp."itemType" = 'PALETTE'
                AND sp."itemId" = ANY($2::text[])
                AND spal."remixedFromUserId" IS NOT NULL
            `,
            [aestheticIds, paletteIds]
        );

    const map =
        new Map<string, PostAttribution>();

    for (const row of result.rows) {
        map.set(row.postId, row);
    }

    return map;
}
