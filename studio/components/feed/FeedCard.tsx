"use client";

import {
    Heart,
    MessageCircle,
    MoreHorizontal,
    Send,
    Sparkles,
    Trash2,
} from "lucide-react";

import {
    useRouter,
} from "next/navigation";

import {
    useState,
} from "react";

import type {
    FeedPostMedia,
} from "../../lib/feedItems";

import {
    creatorProfileHref,
} from "../../lib/creatorHref";

import RemixButton from "./RemixButton";

/**
 * Who a remixed item came from. Mirrors `PostAttribution` in `lib/remix.ts`
 * but keeps only what the card renders, so the serialized props stay small.
 */
export type FeedAttributionData = {
    sourcePostId: string | null;
    sourceDiscordId: string;
    sourceUsername: string | null;
    sourceDisplayName: string | null;
};

export type FeedCommentData = {
    id: string;
    body: string;
    createdAt: Date | string;
    discordId?: string | null;
    username: string | null;
    displayName: string | null;
    avatarHash: string | null;
};

export type FeedCardData = {
    id: string;
    itemType: "AESTHETIC" | "PALETTE" | "ASSET";
    caption: string | null;
    tags: string[];
    likeCount: number;
    commentCount: number;
    createdAt: Date | string;
    authorDiscordId: string;
    authorUsername: string | null;
    authorDisplayName: string | null;
    authorAvatarHash: string | null;
    likedByViewer: boolean;
    media: FeedPostMedia | null;
    attribution?: FeedAttributionData | null;
};

function discordAvatarUrl(
    discordId: string,
    avatarHash: string | null
) {
    if (!avatarHash) {
        return null;
    }

    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=64`;
}

function timeAgo(
    value: Date | string
) {
    const then =
        new Date(value).getTime();

    const seconds =
        Math.max(
            Math.floor(
                (Date.now() - then) / 1000
            ),
            0
        );

    if (seconds < 60) {
        return "just now";
    }

    const minutes =
        Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours =
        Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days =
        Math.floor(hours / 24);

    if (days < 7) {
        return `${days}d ago`;
    }

    return new Intl.DateTimeFormat(
        "en-US",
        {
            month: "short",
            day: "numeric",
        }
    ).format(
        new Date(value)
    );
}

type FeedCardProps = {
    post: FeedCardData;
    viewerDiscordId: string | null;
    initialComments?: FeedCommentData[];
    showComments?: boolean;
};

export default function FeedCard({
    post,
    viewerDiscordId,
    initialComments = [],
    showComments = false,
}: FeedCardProps) {
    const router =
        useRouter();

    const [
        liked,
        setLiked,
    ] = useState(
        post.likedByViewer
    );

    const [
        likeCount,
        setLikeCount,
    ] = useState(
        post.likeCount
    );

    const [
        likeBusy,
        setLikeBusy,
    ] = useState(false);

    const [
        commentsOpen,
        setCommentsOpen,
    ] = useState(showComments);

    const [
        comments,
        setComments,
    ] = useState(initialComments);

    const [
        commentCount,
        setCommentCount,
    ] = useState(
        post.commentCount
    );

    const [
        draft,
        setDraft,
    ] = useState("");

    const [
        commentBusy,
        setCommentBusy,
    ] = useState(false);

    const [
        menuOpen,
        setMenuOpen,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    const isOwner =
        viewerDiscordId !== null &&
        viewerDiscordId ===
            post.authorDiscordId;

    /*
     * Remixing your own post is neither useful nor allowed, so the button is
     * absent rather than disabled — a disabled control on your own card reads
     * like a bug. ASSET posts are absent too: a catalog set is not the
     * poster's work, so crediting them for it would be wrong.
     */
    const canRemix =
        !isOwner &&
        viewerDiscordId !== null &&
        post.itemType !== "ASSET";

    const attribution =
        post.attribution ?? null;

    const attributionName = attribution
        ? (
            attribution.sourceDisplayName ||
            attribution.sourceUsername ||
            "someone"
        )
        : null;

    const attributionHref = attribution
        ? creatorProfileHref(
            attribution.sourceDiscordId
        )
        : null;

    const media =
        post.media;

    function handleMediaDoubleClick() {
        if (!liked) {
            toggleLike();
        }
    }

    const authorName =
        post.authorDisplayName ||
        post.authorUsername ||
        "someone";

    const authorHref = creatorProfileHref(
        post.authorDiscordId
    );

    async function toggleLike() {
        if (likeBusy) {
            return;
        }

        setLikeBusy(true);
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/feed/${post.id}/like`,
                    {
                        method:
                            "POST",
                    }
                );

            const body =
                await response.json() as {
                    liked?: boolean;
                    likeCount?: number;
                    error?: string;
                };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not update like."
                );
            }

            setLiked(
                Boolean(body.liked)
            );

            setLikeCount(
                body.likeCount ??
                    likeCount
            );
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        } finally {
            setLikeBusy(false);
        }
    }

    async function submitComment() {
        const trimmed =
            draft.trim();

        if (
            !trimmed ||
            commentBusy
        ) {
            return;
        }

        setCommentBusy(true);
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/feed/${post.id}/comments`,
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                body: trimmed,
                            }),
                    }
                );

            const body =
                await response.json() as {
                    comment?: FeedCommentData;
                    error?: string;
                };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not post comment."
                );
            }

            if (body.comment) {
                setComments(
                    (current) => [
                        ...current,
                        body.comment as FeedCommentData,
                    ]
                );
            }

            setCommentCount(
                (count) => count + 1
            );

            setDraft("");
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        } finally {
            setCommentBusy(false);
        }
    }

    async function unshare() {
        setMenuOpen(false);
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/feed/${post.id}`,
                    {
                        method:
                            "DELETE",
                    }
                );

            if (!response.ok) {
                const body =
                    await response.json() as {
                        error?: string;
                    };

                throw new Error(
                    body.error ||
                        "Could not remove post."
                );
            }

            router.refresh();
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        }
    }

    return (
        <article className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
            <div className="flex items-center gap-3 px-5 py-4">
                {(() => {
                    /*
                     * The avatar and name are one link to the creator page.
                     * When the author id is not a usable snowflake the group
                     * degrades to a plain div rather than a dead link.
                     */
                    const avatar = discordAvatarUrl(
                        post.authorDiscordId,
                        post.authorAvatarHash
                    );

                    const inner = (
                        <>
                            {avatar ? (
                                <img
                                    src={avatar}
                                    alt={authorName}
                                    className="h-10 w-10 rounded-full border border-white/[0.08] object-cover"
                                />
                            ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold">
                                    {authorName
                                        .charAt(0)
                                        .toUpperCase()}
                                </div>
                            )}

                            <div className="min-w-0 flex-1 text-left">
                                <p className="truncate text-sm font-semibold text-zinc-200 group-hover/name:text-violet-300">
                                    {authorName}
                                </p>

                                <p className="text-xs text-zinc-600">
                                    {timeAgo(post.createdAt)}
                                    {" • "}
                                    {post.itemType === "AESTHETIC"
                                        ? "full profile"
                                        : post.itemType === "PALETTE"
                                        ? "palette"
                                        : "profile set"}
                                </p>
                            </div>
                        </>
                    );

                    return authorHref ? (
                        <a
                            href={authorHref}
                            className="group/name flex min-w-0 flex-1 items-center gap-3"
                            title={`See ${authorName}'s profile`}
                        >
                            {inner}
                        </a>
                    ) : (
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            {inner}
                        </div>
                    );
                })()}

                <div className="relative">
                    <button
                        type="button"
                        onClick={() =>
                            setMenuOpen(
                                (open) => !open
                            )
                        }
                        aria-label="Post options"
                        className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                    >
                        <MoreHorizontal
                            size={17}
                        />
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#14141b] p-1.5 shadow-2xl shadow-black/50">
                            {media?.detailHref && (
                                <a
                                    href={media.detailHref}
                                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
                                >
                                    <Send
                                        size={15}
                                    />

                                    Open in Studio
                                </a>
                            )}

                            {isOwner && (
                                <button
                                    type="button"
                                    onClick={unshare}
                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-rose-400 transition hover:bg-rose-500/10"
                                >
                                    <Trash2
                                        size={15}
                                    />

                                    Remove post
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {!media && (
                <div className="flex min-h-56 flex-col items-center justify-center gap-3 border-y border-white/[0.05] bg-black/20 px-6 py-12 text-center">
                    <p className="text-sm font-medium text-zinc-400">
                        This post references content that no longer exists.
                    </p>
                </div>
            )}

            {media &&
                media.kind !== "palette" && (
                    <a
                        href={
                            media.detailHref ??
                            "#"
                        }
                        onDoubleClick={handleMediaDoubleClick}
                        className="group block"
                    >
                        <div className="relative h-52 overflow-hidden bg-zinc-900 sm:h-64">
                            {media.bannerUrl ? (
                                <img
                                    src={media.bannerUrl}
                                    alt={media.title}
                                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                                />
                            ) : (
                                <div className="h-full w-full bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-transparent" />
                            )}

                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                            {media.pfpUrl && (
                                <div className="absolute bottom-4 left-5 h-16 w-16 overflow-hidden rounded-full border-4 border-[#101015] bg-zinc-900 shadow-xl">
                                    <img
                                        src={media.pfpUrl}
                                        alt={`${media.title} profile picture`}
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                            )}

                            {media.aestheticId && (
                                <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 backdrop-blur">
                                    {media.aestheticId}
                                </span>
                            )}
                        </div>
                    </a>
                )}

            {media &&
                media.kind === "palette" && (
                    <a
                        href={
                            media.detailHref ??
                            "#"
                        }
                        onDoubleClick={handleMediaDoubleClick}
                        className="block px-5 py-6"
                    >
                        <div className="flex h-40 overflow-hidden rounded-2xl border border-white/[0.06]">
                            {(media.palette.length > 0
                                ? media.palette
                                : ["#18181b"]
                            ).map(
                                (color, index) => (
                                    <div
                                        key={`${color}-${index}`}
                                        className="flex-1 transition duration-300 hover:flex-[1.4]"
                                        style={{
                                            backgroundColor:
                                                color,
                                        }}
                                        title={color}
                                    />
                                )
                            )}
                        </div>
                    </a>
                )}

            {media &&
                media.kind === "profile" && (
                    <div className="px-5 pt-4">
                        <p className="text-sm font-semibold text-zinc-200">
                            {media.title}
                        </p>

                        {media.usernameIdea && (
                            <p className="mt-1 truncate font-mono text-sm text-violet-400/80">
                                @
                                {media.usernameIdea}
                            </p>
                        )}

                        {media.status && (
                            <p className="mt-1 truncate text-sm text-zinc-500">
                                {media.symbols.slice(0, 3).join(" ")}{" "}
                                {media.status}
                            </p>
                        )}

                        {media.palette.length >
                            0 && (
                            <div className="mt-3 flex h-6 overflow-hidden rounded-lg border border-white/[0.06]">
                                {media.palette.map(
                                    (
                                        color,
                                        index
                                    ) => (
                                        <div
                                            key={`${color}-${index}`}
                                            className="flex-1"
                                            style={{
                                                backgroundColor:
                                                    color,
                                            }}
                                        />
                                    )
                                )}
                            </div>
                        )}
                    </div>
                )}

            {media &&
                media.kind === "asset" && (
                    <div className="px-5 pt-4">
                        <p className="text-sm font-semibold text-zinc-200">
                            {media.title}
                        </p>

                        {media.subtitle && (
                            <p className="mt-1 truncate text-xs uppercase tracking-[0.16em] text-zinc-600">
                                {media.subtitle}
                            </p>
                        )}
                    </div>
                )}

            <div className="mt-4 flex items-center gap-1 px-4">
                <button
                    type="button"
                    onClick={toggleLike}
                    disabled={likeBusy}
                    aria-label={
                        liked
                            ? "Unlike post"
                            : "Like post"
                    }
                    aria-pressed={liked}
                    className={[
                        "rounded-xl p-2.5 transition",
                        liked
                            ? "text-rose-500 hover:bg-rose-500/10"
                            : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200",
                    ].join(
                        " "
                    )}
                >
                    <Heart
                        size={21}
                        fill={
                            liked
                                ? "currentColor"
                                : "none"
                        }
                    />
                </button>

                <button
                    type="button"
                    onClick={() =>
                        setCommentsOpen(
                            (open) => !open
                        )
                    }
                    aria-label="Toggle comments"
                    className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                >
                    <MessageCircle
                        size={21}
                    />
                </button>

                {canRemix && (
                    <RemixButton
                        postId={post.id}
                        onNotice={setError}
                    />
                )}

                <span className="ml-2 text-sm font-semibold text-zinc-300">
                    {likeCount.toLocaleString()}{" "}
                    {likeCount === 1
                        ? "like"
                        : "likes"}
                </span>

                <span className="ml-auto text-xs text-zinc-600">
                    {commentCount}{" "}
                    {commentCount === 1
                        ? "comment"
                        : "comments"}
                </span>
            </div>

            {attribution && attributionName && (
                /*
                 * The credit line. It links to the original creator, not to
                 * the original post, because the post may have been unshared
                 * while the credit remains — that is the case the stored
                 * author id exists for.
                 */
                <p className="mt-3 px-5 text-xs text-zinc-500">
                    {attributionHref ? (
                        <a
                            href={attributionHref}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1 font-medium text-zinc-400 transition hover:bg-white/[0.07] hover:text-violet-300"
                        >
                            <Sparkles
                                size={12}
                            />

                            {`Remixed from ${attributionName}`}
                        </a>
                    ) : (
                        <span className="inline-flex items-center gap-1.5">
                            <Sparkles
                                size={12}
                            />

                            {`Remixed from ${attributionName}`}
                        </span>
                    )}
                </p>
            )}

            {(post.caption ||
                post.tags.length > 0) && (
                <div className="mt-3 px-5 pb-1">
                    {post.caption && (
                        <p className="text-sm leading-6 text-zinc-300">
                            <span className="mr-2 font-semibold text-zinc-100">
                                {authorName}
                            </span>

                            {post.caption}
                        </p>
                    )}

                    {post.tags.length > 0 && (
                        <p className="mt-2 flex flex-wrap gap-x-2 text-[13px] text-violet-400/80">
                            {post.tags.map(
                                (tag) => (
                                    <a
                                        key={tag}
                                        href={`/dashboard/discover?tag=${encodeURIComponent(tag)}`}
                                        className="hover:text-violet-300 hover:underline"
                                    >
                                        #{tag}
                                    </a>
                                )
                            )}
                        </p>
                    )}
                </div>
            )}

            {error && (
                <p className="mx-5 mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
                    {error}
                </p>
            )}

            {commentsOpen && (
                <div className="mt-4 border-t border-white/[0.05] px-5 py-4">
                    {comments.length ===
                    0 ? (
                        <p className="text-sm text-zinc-600">
                            No comments yet. Be the first.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {comments.map(
                                (comment) => {
                                    const commentName =
                                        comment.displayName ||
                                        comment.username ||
                                        "someone";

                                    const commentHref =
                                        creatorProfileHref(
                                            comment.discordId
                                        );

                                    return (
                                    <div
                                        key={comment.id}
                                        className="flex items-start gap-3"
                                    >
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-zinc-300">
                                            {commentName.charAt(0).toUpperCase()}
                                        </div>
 
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm leading-6 text-zinc-300">
                                                {commentHref ? (
                                                    <a
                                                        href={commentHref}
                                                        className="mr-2 font-semibold text-zinc-100 hover:text-violet-300 hover:underline"
                                                    >
                                                        {commentName}
                                                    </a>
                                                ) : (
                                                    <span className="mr-2 font-semibold text-zinc-100">
                                                        {commentName}
                                                    </span>
                                                )}
 
                                                {comment.body}
                                            </p>
 
                                            <p className="text-[11px] text-zinc-600">
                                                {timeAgo(
                                                    comment.createdAt
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    );
                                }
                            )}
                        </div>
                    )}

                    {viewerDiscordId && (
                        <div className="mt-4 flex items-center gap-2">
                            <input
                                value={draft}
                                onChange={(event) =>
                                    setDraft(
                                        event.target.value
                                    )
                                }
                                onKeyDown={(event) => {
                                    if (
                                        event.key ===
                                        "Enter"
                                    ) {
                                        event.preventDefault();
                                        submitComment();
                                    }
                                }}
                                placeholder="Add a comment..."
                                maxLength={500}
                                className="h-11 flex-1 rounded-xl border border-white/[0.05] bg-black/20 px-4 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500/30"
                            />

                            <button
                                type="button"
                                onClick={submitComment}
                                disabled={
                                    commentBusy ||
                                    !draft.trim()
                                }
                                className="rounded-xl bg-violet-500/15 px-4 py-2.5 text-sm font-semibold text-violet-300 transition hover:bg-violet-500/25 disabled:opacity-50"
                            >
                                Post
                            </button>
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}
