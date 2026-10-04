import {
    getAssetSetById,
} from "./assetCatalog";

import {
    getProfileAssets,
} from "./assets";

import {
    query,
} from "./database";

import type {
    SharedPostSummary,
} from "./sharedFeed";

export type FeedPostMedia = {
    kind: "profile" | "palette" | "asset";

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

    title: string;
    subtitle: string | null;
    detailHref: string | null;
};

export type HydratedFeedPost = SharedPostSummary & {
    media: FeedPostMedia | null;
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
                title: row.name,
                subtitle: row.bio,
                detailHref:
                    `/dashboard/aesthetics/${row.id}`,
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
                title:
                    row.name ??
                    "Color palette",
                subtitle: null,
                detailHref:
                    "/dashboard/palettes",
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
                title:
                    `Profile set #${id}`,
                subtitle:
                    set.aesthetics.join(" • ") ||
                    null,
                detailHref:
                    `/dashboard/assets/${id}`,
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

    const [
        aesthetics,
        palettes,
    ] =
        await Promise.all([
            hydrateAesthetics(aestheticIds),
            hydratePalettes(paletteIds),
        ]);

    const assets =
        hydrateAssets(assetIds);

    return posts.map(
        (post) => ({
            ...post,
            media:
                aesthetics.get(post.itemId) ??
                palettes.get(post.itemId) ??
                assets.get(post.itemId) ??
                null,
        })
    );
}
