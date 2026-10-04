import {
    getAssetSetById,
} from "./assetCatalog";

import {
    getProfileAssets,
} from "./assets";

import {
    query,
} from "./database";

import {
    getAttributionsForPosts,
} from "./remix";

import type {
    PostAttribution,
} from "./remix";

import type {
    SharedItemType,
    SharedPostSummary,
} from "./sharedFeed";

export type FeedPostMedia = {
    /**
     * `composed` is a Profile Builder profile; `profile` is a saved
     * aesthetic. Both render as a profile card — the distinction is that a
     * composed profile has a real username and pronouns to show.
     */
    kind:
        | "profile"
        | "composed"
        | "palette"
        | "asset"
        | "pack";

    setId: string | null;
    pfpUrl: string | null;
    bannerUrl: string | null;

    palette: string[];
    aestheticId: string | null;
    moodId: string | null;

    usernameIdea: string | null;
    bio: string | null;
    status: string | null;
    symbols: string[];

    /**
     * Banner colour when there is no banner image, as `#rrggbb`.
     *
     * Composed profiles pick an accent rather than uploading art, so the card
     * needs something to paint the header with.
     */
    accentColor: string | null;

    title: string;
    subtitle: string | null;

    /**
     * Where the card links. Null for items a viewer cannot open — an
     * Aesthetic Pack lives in someone else's Server Studio, so linking a
     * stranger to it would only produce a 404.
     */
    detailHref: string | null;

    /**
     * The server an Aesthetic Pack belongs to.
     *
     * A pack's post is authored by the member who published it — a guild
     * cannot author a `SharedPost` — so without this the card would credit
     * the pack to a person instead of the community it came from.
     */
    guild: {
        name: string;
        iconUrl: string | null;
    } | null;
};

export type HydratedFeedPost = SharedPostSummary & {
    media: FeedPostMedia | null;

    /**
     * Set when the item this post renders was itself copied from someone
     * else's post. The card turns it into a "Remixed from @x" line.
     */
    attribution: PostAttribution | null;
};

type AestheticRow = {
    id: string;
    name: string;
    "aestheticId": string;
    "moodId": string | null;
    "profileSetId": string | null;
    "usernameIdea": string | null;
    bio: string | null;
    status: string | null;
    symbols: string[];
    palette: string[];
};

type PaletteRow = {
    id: string;
    name: string | null;
    "aestheticId": string | null;
    "moodId": string | null;
    colors: string[];
};

type ProfileRow = {
    id: string;
    name: string;
    "profileSetId": string | null;
    username: string | null;
    discriminator: string | null;
    pronouns: string | null;
    bio: string | null;
    status: string | null;
    symbols: string[];
    palette: string[];
    "accentColor": string | null;
};

type PackRow = {
    id: string;
    name: string;
    description: string | null;
    "aestheticId": string | null;
    "moodId": string | null;
    colors: string[];
    symbols: string[];
    "guildName": string | null;
    "guildDiscordId": string;
    "guildIconHash": string | null;
};

function buildMediaUrl(
    key: string
) {
    const publicUrl =
        process.env.R2_PUBLIC_URL;

    if (!publicUrl) {
        return null;
    }

    const base =
        publicUrl.replace(
            /\/+$/,
            ""
        );

    const encodedKey =
        key
            .split("/")
            .map(encodeURIComponent)
            .join("/");

    return `${base}/${encodedKey}`;
}

function guildIconUrl(
    guildDiscordId: string,
    iconHash: string | null
): string | null {
    if (!iconHash) {
        return null;
    }

    return (
        `https://cdn.discordapp.com/icons/` +
        `${guildDiscordId}/${iconHash}.png?size=128`
    );
}

function profileMediaFromSet(
    setId: string | null
): Pick<
    FeedPostMedia,
    "setId" | "pfpUrl" | "bannerUrl"
> {
    if (!setId) {
        return {
            setId: null,
            pfpUrl: null,
            bannerUrl: null,
        };
    }

    const assets =
        getProfileAssets(setId);

    return {
        setId,
        pfpUrl:
            assets?.pfpUrl ?? null,
        bannerUrl:
            assets?.bannerUrl ?? null,
    };
}

async function hydrateAesthetics(
    ids: string[]
): Promise<Map<string, FeedPostMedia>> {
    if (ids.length === 0) {
        return new Map();
    }

    const result =
        await query<AestheticRow>(
            `
            SELECT
                sa.id,
                sa.name,
                sa."aestheticId",
                sa."moodId",
                sa."profileSetId",
                sa."usernameIdea",
                sa.bio,
                sa.status,
                sa.symbols,
                sa.palette
            FROM "SavedAesthetic" sa
            WHERE sa.id = ANY($1::text[])
            `,
            [ids]
        );

    const map =
        new Map<string, FeedPostMedia>();

    for (const row of result.rows) {
        map.set(
            row.id,
            {
                kind: "profile",
                ...profileMediaFromSet(
                    row.profileSetId
                ),
                palette: row.palette ?? [],
                aestheticId: row.aestheticId,
                moodId: row.moodId,
                usernameIdea: row.usernameIdea,
                bio: row.bio,
                status: row.status,
                symbols: row.symbols ?? [],
                accentColor: null,
                title: row.name,
                subtitle: row.bio,
                detailHref:
                    `/dashboard/aesthetics/${row.id}`,
                guild: null,
            }
        );
    }

    return map;
}

async function hydratePalettes(
    ids: string[]
): Promise<Map<string, FeedPostMedia>> {
    if (ids.length === 0) {
        return new Map();
    }

    const result =
        await query<PaletteRow>(
            `
            SELECT
                sp.id,
                sp.name,
                sp."aestheticId",
                sp."moodId",
                sp.colors
            FROM "SavedPalette" sp
            WHERE sp.id = ANY($1::text[])
            `,
            [ids]
        );

    const map =
        new Map<string, FeedPostMedia>();

    for (const row of result.rows) {
        map.set(
            row.id,
            {
                kind: "palette",
                setId: null,
                pfpUrl: null,
                bannerUrl: null,
                palette: row.colors ?? [],
                aestheticId: row.aestheticId,
                moodId: row.moodId,
                usernameIdea: null,
                bio: null,
                status: null,
                symbols: [],
                accentColor: null,
                title:
                    row.name ??
                    "Color palette",
                subtitle: null,
                detailHref:
                    "/dashboard/palettes",
                guild: null,
            }
        );
    }

    return map;
}

function hydrateAssets(
    ids: string[]
): Map<string, FeedPostMedia> {
    const map =
        new Map<string, FeedPostMedia>();

    for (const id of ids) {
        const set =
            getAssetSetById(id);

        if (!set) {
            continue;
        }

        const pfpKey =
            set.assets?.pfp;
        const bannerKey =
            set.assets?.banner;

        map.set(
            id,
            {
                kind: "asset",
                setId: id,
                pfpUrl: pfpKey
                    ? buildMediaUrl(pfpKey)
                    : null,
                bannerUrl: bannerKey
                    ? buildMediaUrl(bannerKey)
                    : null,
                palette: [],
                aestheticId:
                    set.aesthetics[0] ?? null,
                moodId:
                    set.moods[0] ?? null,
                usernameIdea: null,
                bio: null,
                status: null,
                symbols: [],
                accentColor: null,
                title:
                    `Profile set #${id}`,
                subtitle:
                    set.aesthetics.join(" • ") ||
                    null,
                detailHref:
                    `/dashboard/assets/${id}`,
                guild: null,
            }
        );
    }

    return map;
}

/**
 * Profile Builder profiles.
 *
 * These are the profiles a user composed by hand — a real username,
 * pronouns and accent colour — as opposed to a saved aesthetic, which is a
 * generation result. They share the profile card layout but have more to
 * show, hence the separate `kind`.
 *
 * `detailHref` is null on purpose. `/dashboard/profile/[id]` is the Builder,
 * which is session-scoped and 404s for anyone but the owner, so a link would
 * only ever walk a stranger into an empty page. The card carries enough to
 * view the profile, exactly like a Pack card.
 */
async function hydrateProfiles(
    ids: string[]
): Promise<Map<string, FeedPostMedia>> {
    if (ids.length === 0) {
        return new Map();
    }

    const result =
        await query<ProfileRow>(
            `
            SELECT
                p.id,
                p.name,
                p."profileSetId",
                p.username,
                p.discriminator,
                p.pronouns,
                p.bio,
                p.status,
                p.symbols,
                p.palette,
                p."accentColor"
            FROM "Profile" p
            WHERE p.id = ANY($1::text[])
            `,
            [ids]
        );

    const map =
        new Map<string, FeedPostMedia>();

    for (const row of result.rows) {
        // The card shows one handle line. A composed profile's username with
        // its discriminator reads like a real Discord handle, which is the
        // point of the Builder, so it wins over the profile's internal name.
        const handle = row.username
            ? row.discriminator
                ? `${row.username}#${row.discriminator}`
                : row.username
            : null;

        map.set(
            row.id,
            {
                kind: "composed",
                ...profileMediaFromSet(
                    row.profileSetId
                ),
                palette: row.palette ?? [],
                aestheticId: null,
                moodId: null,
                usernameIdea: handle,
                bio: row.bio,
                status: row.status,
                symbols: row.symbols ?? [],
                accentColor: row.accentColor,
                title: row.name,
                subtitle: row.pronouns ?? row.bio,
                detailHref: null,
                guild: null,
            }
        );
    }

    return map;
}

/**
 * Server Aesthetic Packs.
 *
 * Joined through `Guild` for the server's name and icon: the pack itself only
 * stores `guildId`, and crediting a pack to the member who happened to press
 * publish would misattribute a community's work to one person.
 */
async function hydratePacks(
    ids: string[]
): Promise<Map<string, FeedPostMedia>> {
    if (ids.length === 0) {
        return new Map();
    }

    const result =
        await query<PackRow>(
            `
            SELECT
                p.id,
                p.name,
                p.description,
                p."aestheticId",
                p."moodId",
                p.colors,
                p.symbols,
                g.name AS "guildName",
                g."discordId" AS "guildDiscordId",
                g."iconHash" AS "guildIconHash"
            FROM "AestheticPack" p
            INNER JOIN "Guild" g
                ON g.id = p."guildId"
            WHERE p.id = ANY($1::text[])
            `,
            [ids]
        );

    const map =
        new Map<string, FeedPostMedia>();

    for (const row of result.rows) {
        map.set(
            row.id,
            {
                kind: "pack",
                setId: null,
                pfpUrl: null,
                bannerUrl: null,
                palette: row.colors ?? [],
                aestheticId: row.aestheticId,
                moodId: row.moodId,
                usernameIdea: null,
                bio: row.description,
                status: null,
                symbols: row.symbols ?? [],
                // No banner art and no accent field on a pack, so the header
                // borrows the pack's lead colour — the card then reads as that
                // pack's palette rather than as a generic gradient.
                accentColor:
                    (row.colors ?? [])[0] ?? null,
                title: row.name,
                subtitle: row.description,
                // Server Studio is management-only, so a visitor from Discover
                // has nothing to do there. The card falls back to a
                // non-clickable header.
                detailHref: null,
                guild: {
                    name:
                        row.guildName ??
                        "a Discord server",
                    iconUrl: guildIconUrl(
                        row.guildDiscordId,
                        row.guildIconHash
                    ),
                },
            }
        );
    }

    return map;
}

export async function hydrateFeedPosts(
    posts: SharedPostSummary[]
): Promise<HydratedFeedPost[]> {
    const aestheticIds = posts
        .filter(
            (post) =>
                post.itemType === "AESTHETIC"
        )
        .map(
            (post) => post.itemId
        );

    const paletteIds = posts
        .filter(
            (post) =>
                post.itemType === "PALETTE"
        )
        .map(
            (post) => post.itemId
        );

    const assetIds = posts
        .filter(
            (post) =>
                post.itemType === "ASSET"
        )
        .map(
            (post) => post.itemId
        );

    const profileIds = posts
        .filter(
            (post) =>
                post.itemType === "PROFILE"
        )
        .map(
            (post) => post.itemId
        );

    const packIds = posts
        .filter(
            (post) =>
                post.itemType === "PACK"
        )
        .map(
            (post) => post.itemId
        );

    const [
        aesthetics,
        palettes,
        profiles,
        packs,
        attributions,
    ] =
        await Promise.all([
            hydrateAesthetics(aestheticIds),
            hydratePalettes(paletteIds),
            hydrateProfiles(profileIds),
            hydratePacks(packIds),
            getAttributionsForPosts(posts),
        ]);

    const assets =
        hydrateAssets(assetIds);

    // Keyed by item type rather than by trying each map in turn. Ids are
    // cuids so a collision is improbable, but a lookup that ignores
    // `itemType` would silently render the wrong card if one ever happened,
    // and ASSET ids are hand-written catalog numbers that are trivially
    // collidable.
    const mediaByType: Record<
        SharedItemType,
        Map<string, FeedPostMedia> | null
    > = {
        AESTHETIC: aesthetics,
        PALETTE: palettes,
        PROFILE: profiles,
        PACK: packs,
        // Catalog sets are hydrated synchronously from a static list.
        ASSET: assets,
    };

    return posts.map(
        (post) => ({
            ...post,
            media:
                mediaByType[post.itemType]?.get(
                    post.itemId
                ) ?? null,
            attribution:
                attributions.get(post.id) ??
                null,
        })
    );
}
