import {
    ArrowLeft,
    CircleUserRound,
    Hash,
    Palette,
    Sparkles,
} from "lucide-react";

import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import AestheticActions from "../../../../components/aesthetics/AestheticActions";
import CopyButton from "../../../../components/aesthetics/CopyButton";

import AddAestheticToCollectionButton from "../../../../components/collections/AddAestheticToCollectionButton";

import ShareToFeedButton from "../../../../components/feed/ShareToFeedButton";

import {
    getCollectionsForAesthetic,
} from "../../../../lib/collections";

import {
    getSavedAestheticByIdForDiscordUser,
} from "../../../../lib/savedAesthetics";

import {
    tryGetProfileAssets,
} from "../../../../lib/assets";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

function titleCase(
    value: string | null
) {
    if (!value) {
        return "—";
    }

    return value
        .split(/[-_]/)
        .map(
            (part) =>
                part.charAt(0)
                    .toUpperCase() +
                part.slice(1)
        )
        .join(" ");
}

function formatDate(
    value: Date
) {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            dateStyle: "medium",
            timeStyle: "short",
        }
    ).format(
        new Date(value)
    );
}

export default async function SavedAestheticPage({
    params,
}: PageProps) {
    const {
        id,
    } =
        await params;

    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        notFound();
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        notFound();
    }

    const aesthetic =
        await getSavedAestheticByIdForDiscordUser(
            id,
            session.discordId
        );

    if (!aesthetic) {
        notFound();
    }

    const collections =
        await getCollectionsForAesthetic(
            session.discordId,
            aesthetic.id
        );

    /*
     * The pfp and banner are not stored with the save — the set id is, and
     * the catalog says which images belong to it. Deriving them keeps a
     * re-uploaded asset working and avoids leaving a permanent direct link
     * to a premium image sitting in a row.
     */
    const assets =
        tryGetProfileAssets(
            aesthetic.profileSetId
        );

    return (
        <>
            <a
                href="/dashboard/aesthetics"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft
                    size={16}
                />

                My Aesthetics
            </a>

            <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Saved Aesthetic
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        {
                            aesthetic.name
                        }
                    </h1>

                    <p className="mt-3 text-sm text-zinc-500">
                        Last updated{" "}
                        {formatDate(
                            aesthetic.updatedAt
                        )}
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <ShareToFeedButton
                        itemType="AESTHETIC"
                        itemId={
                            aesthetic.id
                        }
                        defaultTitle={
                            aesthetic.name
                        }
                    />

                    <AddAestheticToCollectionButton
                        aestheticId={
                            aesthetic.id
                        }
                        collections={
                            collections
                        }
                    />

                    <AestheticActions
                        id={
                            aesthetic.id
                        }
                        currentName={
                            aesthetic.name
                        }
                    />
                </div>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                <section className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                    <div className="relative min-h-72 overflow-hidden bg-gradient-to-br from-violet-500/10 via-[#121218] to-fuchsia-500/[0.06] p-8">
                        {assets && (
                            <img
                                src={assets.bannerUrl}
                                alt={`Profile Set ${assets.setId} banner`}
                                className="absolute inset-0 h-full w-full object-cover opacity-60"
                            />
                        )}

                        {assets && (
                            <div className="absolute inset-0 bg-gradient-to-b from-[#101015]/60 via-[#101015]/80 to-[#101015]" />
                        )}

                        {!assets && (
                            <>
                                <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

                                <div className="absolute -bottom-20 left-12 h-52 w-52 rounded-full bg-fuchsia-500/[0.07] blur-3xl" />
                            </>
                        )}

                        <div className="relative">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
                                Profile Concept
                            </p>

                            <div className="mt-10 flex items-start gap-5">
                                {assets ? (
                                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-[#15151c] bg-zinc-900 shadow-xl shadow-violet-950/40">
                                        <img
                                            src={assets.pfpUrl}
                                            alt={`Profile Set ${assets.setId} profile picture`}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-[#15151c] bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-xl shadow-violet-950/40">
                                        <CircleUserRound
                                            size={34}
                                        />
                                    </div>
                                )}

                                <div className="min-w-0 pt-2">
                                    <p className="font-mono text-xl font-semibold text-zinc-100">
                                        {aesthetic.usernameIdea ||
                                            session.username}
                                    </p>

                                    {aesthetic.status && (
                                        <p className="mt-2 max-w-xl text-sm text-zinc-400">
                                            {
                                                aesthetic.status
                                            }
                                        </p>
                                    )}
                                </div>
                            </div>

                            {aesthetic.bio && (
                                <p className="mt-8 max-w-2xl text-sm leading-7 text-zinc-300">
                                    {
                                        aesthetic.bio
                                    }
                                </p>
                            )}

                            {aesthetic.palette.length >
                                0 && (
                                <div className="mt-8 flex h-12 max-w-xl overflow-hidden rounded-xl border border-white/[0.08]">
                                    {aesthetic.palette.map(
                                        (
                                            color,
                                            index
                                        ) => (
                                            <div
                                                key={`${color}-${index}`}
                                                title={
                                                    color
                                                }
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
                    </div>
                </section>

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                            <Sparkles
                                size={18}
                            />
                        </div>

                        <h2 className="font-semibold">
                            Aesthetic Details
                        </h2>
                    </div>

                    <dl className="mt-6 space-y-5">
                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-sm text-zinc-600">
                                Style
                            </dt>

                            <dd className="text-sm font-medium text-zinc-300">
                                {titleCase(
                                    aesthetic.aestheticId
                                )}
                            </dd>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-sm text-zinc-600">
                                Mood
                            </dt>

                            <dd className="text-sm font-medium text-zinc-300">
                                {titleCase(
                                    aesthetic.moodId
                                )}
                            </dd>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-sm text-zinc-600">
                                Color
                            </dt>

                            <dd className="text-sm font-medium text-zinc-300">
                                {titleCase(
                                    aesthetic.colorFilter
                                )}
                            </dd>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <dt className="text-sm text-zinc-600">
                                Profile Set
                            </dt>

                            <dd className="font-mono text-sm text-zinc-300">
                                {aesthetic.profileSetId ||
                                    "—"}
                            </dd>
                        </div>
                    </dl>
                </section>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
                {aesthetic.usernameIdea && (
                    <ContentPanel
                        title="Username"
                        icon={
                            <CircleUserRound
                                size={18}
                            />
                        }
                        value={
                            aesthetic.usernameIdea
                        }
                    />
                )}

                {aesthetic.status && (
                    <ContentPanel
                        title="Status"
                        icon={
                            <Hash
                                size={18}
                            />
                        }
                        value={
                            aesthetic.status
                        }
                    />
                )}
            </div>

            {aesthetic.bio && (
                <div className="mt-6">
                    <ContentPanel
                        title="Bio"
                        icon={
                            <Sparkles
                                size={18}
                            />
                        }
                        value={
                            aesthetic.bio
                        }
                        multiline
                    />
                </div>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                            <Palette
                                size={18}
                            />
                        </div>

                        <h2 className="font-semibold">
                            Palette
                        </h2>
                    </div>

                    {aesthetic.palette.length >
                    0 ? (
                        <>
                            <div className="mt-6 flex h-16 overflow-hidden rounded-2xl border border-white/[0.07]">
                                {aesthetic.palette.map(
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

                            <div className="mt-4 flex flex-wrap gap-2">
                                {aesthetic.palette.map(
                                    (
                                        color,
                                        index
                                    ) => (
                                        <span
                                            key={`${color}-${index}`}
                                            className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5 font-mono text-xs text-zinc-500"
                                        >
                                            {
                                                color
                                            }
                                        </span>
                                    )
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="mt-6 text-sm text-zinc-600">
                            No palette saved.
                        </p>
                    )}
                </section>

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                Decorative
                            </p>

                            <h2 className="mt-2 font-semibold">
                                Symbols
                            </h2>
                        </div>

                        {aesthetic.symbols.length >
                            0 && (
                            <CopyButton
                                value={aesthetic.symbols.join(
                                    " "
                                )}
                            />
                        )}
                    </div>

                    {aesthetic.symbols.length >
                    0 ? (
                        <p className="mt-8 text-3xl tracking-[0.25em] text-zinc-300">
                            {aesthetic.symbols.join(
                                " "
                            )}
                        </p>
                    ) : (
                        <p className="mt-6 text-sm text-zinc-600">
                            No symbols saved.
                        </p>
                    )}
                </section>
            </div>

            <div className="mt-6 rounded-2xl border border-white/[0.05] bg-white/[0.015] px-5 py-4 text-xs text-zinc-600">
                Generation ID:{" "}

                <span className="font-mono">
                    {aesthetic.generationId ||
                        "Legacy save"}
                </span>
            </div>
        </>
    );
}

function ContentPanel({
    title,
    icon,
    value,
    multiline = false,
}: {
    title: string;
    icon: React.ReactNode;
    value: string;
    multiline?: boolean;
}) {
    return (
        <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                        {
                            icon
                        }
                    </div>

                    <h2 className="font-semibold">
                        {
                            title
                        }
                    </h2>
                </div>

                <CopyButton
                    value={
                        value
                    }
                />
            </div>

            <p
                className={[
                    "mt-6 text-zinc-300",
                    multiline
                        ? "whitespace-pre-wrap text-sm leading-7"
                        : "font-mono text-sm",
                ].join(
                    " "
                )}
            >
                {
                    value
                }
            </p>
        </section>
    );
}