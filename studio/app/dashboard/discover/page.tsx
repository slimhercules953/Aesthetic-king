import {
    cookies,
} from "next/headers";

import {
    Compass,
    Flame,
    Search,
    Sparkles,
} from "lucide-react";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    getFeedPosts,
    getSharedPostCommentsByPostIds,
    isSharedItemType,
} from "../../../lib/sharedFeed";

import type {
    SharedItemType,
} from "../../../lib/sharedFeed";

import {
    normalizeFeedSearchTerm,
    searchFeedCreators,
    searchFeedPosts,
} from "../../../lib/feedSearch";

import {
    creatorProfileHref,
} from "../../../lib/creatorHref";

import {
    hydrateFeedPosts,
} from "../../../lib/feedItems";

import FeedCard, {
    type FeedCardData,
    type FeedCommentData,
} from "../../../components/feed/FeedCard";

const PAGE_SIZE =
    18;

/*
 * The chip labels have to agree with `SHARED_ITEM_LABELS` on the cards. The
 * old "Profiles" chip meant AESTHETIC, which is now ambiguous against the
 * PROFILE type the Profile Builder publishes, so the two are named apart:
 * a saved look is an "aesthetic", a Builder composition is a "profile".
 */
const FILTERS: {
    label: string;
    value: SharedItemType | null;
}[] = [
    {
        label: "All",
        value: null,
    },
    {
        label: "Aesthetics",
        value: "AESTHETIC",
    },
    {
        label: "Profiles",
        value: "PROFILE",
    },
    {
        label: "Palettes",
        value: "PALETTE",
    },
    {
        label: "Asset sets",
        value: "ASSET",
    },
    {
        label: "Server packs",
        value: "PACK",
    },
];

function buildQuery(
    params: {
        type?: string | null;
        sort?: string | null;
        tag?: string | null;
        q?: string | null;
    }
) {
    const search =
        new URLSearchParams();

    if (params.type) {
        search.set(
            "type",
            params.type
        );
    }

    if (params.sort) {
        search.set(
            "sort",
            params.sort
        );
    }

    if (params.tag) {
        search.set(
            "tag",
            params.tag
        );
    }

    if (params.q) {
        search.set(
            "q",
            params.q
        );
    }

    const value =
        search.toString();

    return value
        ? `/dashboard/discover?${value}`
        : "/dashboard/discover";
}

export default async function DiscoverPage({
    searchParams,
}: {
    searchParams?: Promise<
        Record<string, string | string[] | undefined>
    >;
}) {
    const raw =
        (await searchParams) ?? {};

    const typeParam =
        typeof raw.type === "string"
            ? raw.type.toUpperCase()
            : null;

    /*
     * Validated against the shared list rather than a local set of literals,
     * otherwise a new item type would silently fall back to "All" here while
     * working everywhere else.
     */
    const itemType: SharedItemType | null =
        typeParam && isSharedItemType(typeParam)
            ? typeParam
            : null;

    const sort: "recent" | "popular" =
        raw.sort === "popular"
            ? "popular"
            : "recent";

    const tag =
        typeof raw.tag === "string"
            ? raw.tag
                .trim()
                .replace(/^#+/, "")
                .toLowerCase()
            : null;

    /*
     * A term shorter than two characters is dropped rather than searched —
     * a one-letter ILIKE would scan the whole feed and return noise. The
     * raw value is kept for the input so what was typed survives a reload.
     */
    const searchParam =
        typeof raw.q === "string"
            ? raw.q
            : null;

    const term =
        normalizeFeedSearchTerm(
            searchParam
        );

    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    const session = sessionCookie
        ? await verifySessionToken(
                sessionCookie.value
            )
        : null;

    const viewerDiscordId =
        session?.discordId ?? null;

    /*
     * A term and the browse view share one grid. Searching swaps the data
     * source rather than the layout, so filters, sort and cards behave
     * identically either way.
     */
    const posts = term
        ? await searchFeedPosts(
                term,
                viewerDiscordId,
                {
                    itemType,
                    tag,
                    sort,
                    limit: PAGE_SIZE,
                }
            )
        : await getFeedPosts(
                viewerDiscordId,
                {
                    itemType,
                    tag,
                    sort,
                    limit: PAGE_SIZE,
                }
            );

    const creators = term
        ? await searchFeedCreators(
                term,
                6
            )
        : [];

    const [
        hydrated,
        commentsByPostId,
    ] = await Promise.all([
        hydrateFeedPosts(
            posts
        ),
        getSharedPostCommentsByPostIds(
            posts.map(
                (post) => post.id
            )
        ),
    ]);

    const cards: FeedCardData[] =
        hydrated.map(
            (post) => ({
                id: post.id,
                itemType: post.itemType,
                caption: post.caption,
                tags: post.tags,
                likeCount: post.likeCount,
                commentCount: post.commentCount,
                createdAt: post.createdAt,
                authorDiscordId:
                    post.authorDiscordId,
                authorUsername:
                    post.authorUsername,
                authorDisplayName:
                    post.authorDisplayName,
                authorAvatarHash:
                    post.authorAvatarHash,
                likedByViewer:
                    post.likedByViewer,
                media: post.media,
                attribution:
                    post.attribution,
            })
        );

    const commentsByPost: Record<
        string,
        FeedCommentData[]
    > = {};

    for (const [
        postId,
        comments,
    ] of commentsByPostId) {
        commentsByPost[postId] =
            comments.map(
                (comment) => ({
                    id: comment.id,
                    body: comment.body,
                    createdAt:
                        comment.createdAt,
                    discordId:
                        comment.discordId,
                    username:
                        comment.username,
                    displayName:
                        comment.displayName,
                    avatarHash:
                        comment.avatarHash,
                })
            );
    }

    const activeFilter =
        itemType ?? "ALL";

    return (
        <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Community
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        Discover
                    </h1>

                    <p className="mt-3 max-w-xl text-zinc-500">
                        Profiles, palettes and asset sets the community pushed to the feed. Like them, comment on them, and push your own.
                    </p>
                </div>

                <a
                    href="/dashboard/create"
                    className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 sm:self-auto"
                >
                    <Sparkles
                        size={16}
                    />

                    Create something
                </a>
            </div>

            <form
                method="get"
                action="/dashboard/discover"
                className="mt-8 flex flex-wrap items-center gap-3"
            >
                {/*
                  * A plain GET form rather than a client component: the page
                  * is already the search's only state, so the URL is the
                  * cheapest thing that keeps filters, sort and results
                  * shareable and reload-safe.
                  */}
                <input
                    type="hidden"
                    name="sort"
                    value={sort}
                />

                {itemType && (
                    <input
                        type="hidden"
                        name="type"
                        value={itemType}
                    />
                )}

                {tag && (
                    <input
                        type="hidden"
                        name="tag"
                        value={tag}
                    />
                )}

                <label className="relative flex-1 basis-64">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
                    />

                    <input
                        type="search"
                        name="q"
                        defaultValue={
                            searchParam ?? ""
                        }
                        placeholder="Search captions, tags, creators, palettes..."
                        maxLength={64}
                        className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-2.5 pl-11 pr-4 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40"
                    />
                </label>

                <button
                    type="submit"
                    className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                >
                    Search
                </button>

                {searchParam && (
                    <a
                        href={buildQuery({
                            type: itemType,
                            sort,
                            tag,
                        })}
                        className="text-xs font-semibold text-zinc-500 underline-offset-4 transition hover:text-zinc-200 hover:underline"
                    >
                        Clear search
                    </a>
                )}
            </form>

            <div className="mt-8 flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-2">
                    {FILTERS.map(
                        (filter) => {
                            const value =
                                filter.value ??
                                "ALL";

                            const active =
                                activeFilter ===
                                value;

                            return (
                                <a
                                    key={filter.label}
                                    href={buildQuery({
                                        type: filter.value,
                                        sort,
                                        tag,
                                        q: searchParam,
                                    })}
                                    className={[
                                        "rounded-xl border px-4 py-2 text-sm font-medium transition",
                                        active
                                            ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                                            : "border-white/[0.06] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-200",
                                    ].join(
                                        " "
                                    )}
                                >
                                    {filter.label}
                                </a>
                            );
                        }
                    )}
                </div>

                <div className="ml-auto flex gap-2">
                    <a
                        href={buildQuery({
                            type: itemType,
                            sort: "recent",
                            tag,
                            q: searchParam,
                        })}
                        className={[
                            "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
                            sort === "recent"
                                ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                                : "border-white/[0.06] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-200",
                        ].join(
                            " "
                        )}
                    >
                        <Compass
                            size={15}
                        />

                        Recent
                    </a>

                    <a
                        href={buildQuery({
                            type: itemType,
                            sort: "popular",
                            tag,
                            q: searchParam,
                        })}
                        className={[
                            "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
                            sort === "popular"
                                ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-200"
                                : "border-white/[0.06] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-200",
                        ].join(
                            " "
                        )}
                    >
                        <Flame
                            size={15}
                        />

                        Popular
                    </a>
                </div>
            </div>

            {tag && (
                <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] px-5 py-4">
                    <p className="text-sm text-zinc-300">
                        Showing posts tagged{" "}
                        <span className="font-semibold text-violet-300">
                            #{tag}
                        </span>
                    </p>

                    <a
                        href={buildQuery({
                            type: itemType,
                            sort,
                            tag: null,
                            q: searchParam,
                        })}
                        className="ml-auto text-xs font-semibold text-zinc-500 underline-offset-4 transition hover:text-zinc-200 hover:underline"
                    >
                        Clear tag
                    </a>
                </div>
            )}

            {creators.length > 0 && (
                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
                        Creators matching{" "}
                        <span className="text-violet-300">
                            {term}
                        </span>
                    </p>

                    <div className="mt-3 flex flex-wrap gap-3">
                        {creators.map(
                            (creator) => {
                                const name =
                                    creator.displayName ||
                                    creator.username ||
                                    "Creator";

                                const href =
                                    creatorProfileHref(
                                        creator.discordId
                                    );

                                if (!href) {
                                    return null;
                                }

                                return (
                                    <a
                                        key={creator.discordId}
                                        href={href}
                                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] px-3 py-2 transition hover:border-violet-500/30 hover:bg-violet-500/[0.06]"
                                    >
                                        {creator.avatarHash ? (
                                            <img
                                                src={`https://cdn.discordapp.com/avatars/${creator.discordId}/${creator.avatarHash}.png?size=64`}
                                                alt={name}
                                                className="h-7 w-7 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[11px] font-semibold">
                                                {name
                                                    .charAt(0)
                                                    .toUpperCase()}
                                            </div>
                                        )}

                                        <span className="text-sm font-medium text-zinc-200">
                                            {name}
                                        </span>

                                        <span className="text-xs text-zinc-600">
                                            {creator.postCount}
                                        </span>
                                    </a>
                                );
                            }
                        )}
                    </div>
                </div>
            )}

            {cards.length === 0 ? (
                <div className="mt-10 flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300">
                        <Compass
                            size={28}
                        />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold text-zinc-200">
                        {term
                            ? "Nothing matched that search"
                            : tag
                            ? "Nothing tagged yet"
                            : "The feed is empty"}
                    </h2>

                    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                        {term
                            ? "Search looks at captions, tags, creator names, saved aesthetic names and palette colours across everything the community published. Try a shorter or different term."
                            : tag
                            ? "No posts use that tag yet. Try another one, or add it when you share something."
                            : "Be the first to push a profile, palette or asset set to the community feed. Use the Share to Feed button on anything in your library."}
                    </p>

                    <a
                        href="/dashboard/aesthetics"
                        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                    >
                        Browse your library
                    </a>
                </div>
            ) : (
                <div className="mt-8 grid gap-6 xl:grid-cols-2">
                    {cards.map(
                        (card) => (
                            <FeedCard
                                key={card.id}
                                post={card}
                                viewerDiscordId={
                                    viewerDiscordId
                                }
                                initialComments={
                                    commentsByPost[
                                        card.id
                                    ] ?? []
                                }
                                showComments={
                                    Boolean(tag)
                                }
                            />
                        )
                    )}
                </div>
            )}
        </>
    );
}
