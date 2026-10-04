import {
    ArrowLeft,
    Compass,
    Heart,
    Layers,
    MessageCircle,
    Palette,
    Sparkles,
    UserRound,
} from "lucide-react";

import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    getCreatorProfile,
    getCreatorTopTags,
} from "../../../../lib/creator";

import {
    getFeedPostsByAuthorDiscordId,
    getSharedPostCommentsByPostIds,
} from "../../../../lib/sharedFeed";

import {
    hydrateFeedPosts,
} from "../../../../lib/feedItems";

import FeedCard, {
    type FeedCardData,
    type FeedCommentData,
} from "../../../../components/feed/FeedCard";

type PageProps = {
    params: Promise<{
        discordId: string;
    }>;
};

const POSTS_LIMIT = 30;

function discordAvatarUrl(
    discordId: string,
    avatarHash: string | null
) {
    if (!avatarHash) {
        return null;
    }

    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=128`;
}

function formatJoined(
    value: Date
) {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            month: "long",
            year: "numeric",
        }
    ).format(
        new Date(value)
    );
}

function plural(
    count: number,
    singular: string,
    pluralWord?: string
) {
    return count === 1
        ? singular
        : pluralWord ?? `${singular}s`;
}

export default async function CreatorProfilePage({
    params,
}: PageProps) {
    const {
        discordId,
    } = await params;

    /*
     * The URL segment is user-controlled, so it is validated before it
     * reaches SQL. Anything that is not a snowflake is answered with a 404
     * rather than a query.
     */
    const profile =
        await getCreatorProfile(discordId);

    if (!profile) {
        notFound();
    }

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

    const [
        posts,
        topTags,
    ] = await Promise.all([
        getFeedPostsByAuthorDiscordId(
            profile.discordId,
            viewerDiscordId,
            POSTS_LIMIT
        ),
        getCreatorTopTags(
            profile.discordId
        ),
    ]);

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

    const displayName =
        profile.displayName ||
        profile.username ||
        "Creator";

    const isSelf =
        viewerDiscordId ===
        profile.discordId;

    const avatar = discordAvatarUrl(
        profile.discordId,
        profile.avatarHash
    );

    const stats = [
        {
            label: plural(
                profile.postCount,
                "post"
            ),
            value: profile.postCount,
            icon: Layers,
        },
        {
            label: "likes received",
            value: profile.likesReceived,
            icon: Heart,
        },
        {
            label: "comments received",
            value: profile.commentsReceived,
            icon: MessageCircle,
        },
        {
            label: "remixes received",
            value: profile.remixesReceived,
            icon: Sparkles,
        },
    ];

    return (
        <>
            <a
                href="/dashboard/discover"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft
                    size={15}
                />

                Back to Discover
            </a>

            <div className="mt-6 overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                <div className="h-28 bg-gradient-to-r from-violet-600/30 via-fuchsia-600/20 to-transparent sm:h-36" />

                <div className="px-6 pb-6">
                    <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
                        {avatar ? (
                            <img
                                src={avatar}
                                alt={displayName}
                                className="h-24 w-24 rounded-2xl border-4 border-[#101015] object-cover"
                            />
                        ) : (
                            <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-[#101015] bg-gradient-to-br from-violet-500 to-fuchsia-500 text-3xl font-bold">
                                {displayName
                                    .charAt(0)
                                    .toUpperCase()}
                            </div>
                        )}

                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                                {displayName}
                            </h1>

                            <p className="mt-1 text-sm text-zinc-500">
                                {profile.username
                                    ? `@${profile.username}`
                                    : "Studio creator"}
                                {" • "}
                                in the Studio since{" "}
                                {formatJoined(
                                    profile.joinedAt
                                )}
                            </p>
                        </div>

                        {isSelf && (
                            <a
                                href="/dashboard/aesthetics"
                                className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15 sm:self-auto"
                            >
                                <Sparkles
                                    size={15}
                                />

                                This is you
                            </a>
                        )}
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        {stats.map(
                            (stat) => (
                                <div
                                    key={stat.label}
                                    className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                                >
                                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
                                        <stat.icon
                                            size={13}
                                        />

                                        {stat.label}
                                    </p>

                                    <p className="mt-1 text-2xl font-bold text-zinc-100">
                                        {stat.value}
                                    </p>
                                </div>
                            )
                        )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                        <p className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
                            Makes
                        </p>

                        {topTags.length === 0 ? (
                            <p className="text-sm text-zinc-600">
                                No tags on their posts yet
                            </p>
                        ) : (
                            topTags.map(
                                (entry) => (
                                    <a
                                        key={entry.tag}
                                        href={`/dashboard/discover?tag=${encodeURIComponent(entry.tag)}`}
                                        className="rounded-lg border border-white/[0.06] px-2.5 py-1 text-xs text-violet-300/90 transition hover:border-violet-500/30 hover:bg-violet-500/10"
                                    >
                                        #{entry.tag}
                                        <span className="ml-1.5 text-zinc-600">
                                            {entry.count}
                                        </span>
                                    </a>
                                )
                            )
                        )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-600">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-2.5 py-1">
                            <UserRound
                                size={12}
                            />

                            {profile.profileCount}{" "}
                            {plural(
                                profile.profileCount,
                                "profile"
                            )}
                        </span>

                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-2.5 py-1">
                            <Palette
                                size={12}
                            />

                            {profile.paletteCount}{" "}
                            {plural(
                                profile.paletteCount,
                                "palette"
                            )}
                        </span>

                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-2.5 py-1">
                            <Layers
                                size={12}
                            />

                            {profile.assetSetCount}{" "}
                            {plural(
                                profile.assetSetCount,
                                "asset set",
                                "asset sets"
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {cards.length === 0 ? (
                <div className="mt-10 flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300">
                        <Compass
                            size={28}
                        />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold text-zinc-200">
                        Nothing published yet
                    </h2>

                    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                        {isSelf
                            ? "Nothing you have made is in the feed yet. Use the Share to Feed button on anything in your library and it will show up here."
                            : `${displayName} has not pushed anything to the community feed yet.`}
                    </p>

                    <a
                        href="/dashboard/discover"
                        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                    >
                        Browse Discover
                    </a>
                </div>
            ) : (
                <>
                    <h2 className="mt-10 text-lg font-semibold text-zinc-200">
                        Published work
                    </h2>

                    <div className="mt-4 grid gap-6 xl:grid-cols-2">
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
                                />
                            )
                        )}
                    </div>

                    {profile.postCount >
                        cards.length && (
                        <p className="mt-8 text-sm text-zinc-600">
                            Showing the {cards.length}{" "}
                            newest of{" "}
                            {profile.postCount}{" "}
                            {plural(
                                profile.postCount,
                                "post"
                            )}
                            .
                        </p>
                    )}
                </>
            )}
        </>
    );
}
