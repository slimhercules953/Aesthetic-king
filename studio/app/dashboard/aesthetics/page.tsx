import {
    cookies,
} from "next/headers";

import {
    Grid3X3,
    Search,
    Sparkles,
} from "lucide-react";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    getSavedAestheticsByDiscordId,
} from "../../../lib/savedAesthetics";

function formatDate(
    value: Date
) {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric",
        }
    ).format(
        new Date(value)
    );
}

export default async function MyAestheticsPage() {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        return null;
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        return null;
    }

    const aesthetics =
        await getSavedAestheticsByDiscordId(
            session.discordId
        );

    return (
        <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Library
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        My Aesthetics
                    </h1>

                    <p className="mt-3 text-zinc-500">
                        Everything you&apos;ve saved from Discord and Studio.
                    </p>
                </div>

                <a
                    href="/dashboard/create"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5"
                >
                    <Sparkles
                        size={
                            17
                        }
                    />

                    New Aesthetic
                </a>
            </div>

            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-[#101015] p-3 sm:flex-row">
                <div className="relative flex-1">
                    <Search
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
                    />

                    <input
                        placeholder="Search aesthetics..."
                        className="h-11 w-full rounded-xl border border-white/[0.05] bg-black/20 pl-10 pr-4 text-sm text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-violet-500/30"
                    />
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-white/[0.05] bg-black/20 px-4 text-sm text-zinc-500">
                    <Grid3X3
                        size={
                            16
                        }
                    />

                    {
                        aesthetics.length
                    }{" "}
                    saved
                </div>
            </div>

            {aesthetics.length ===
            0 ? (
                <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                        <Sparkles
                            size={
                                24
                            }
                        />
                    </div>

                    <h2 className="mt-5 text-xl font-semibold">
                        Your library is empty
                    </h2>

                    <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                        Save an aesthetic from Discord or create one inside Studio to start building your collection.
                    </p>
                </div>
            ) : (
                <div className="mt-8 grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                    {aesthetics.map(
                        (
                            aesthetic
                        ) => (
                            <a
                                key={
                                    aesthetic.id
                                }
                                href={`/dashboard/aesthetics/${aesthetic.id}`}
                                className="group overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015] transition duration-200 hover:-translate-y-1 hover:border-violet-500/20 hover:shadow-2xl hover:shadow-violet-950/20"
                            >
                                <div className="relative h-24 overflow-hidden bg-gradient-to-br from-violet-500/10 via-fuchsia-500/[0.05] to-transparent">
                                    <div className="absolute inset-0 opacity-80">
                                        <div className="absolute -left-10 top-4 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />

                                        <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-fuchsia-500/10 blur-3xl" />
                                    </div>

                                    <div className="absolute bottom-4 left-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-black/40 text-violet-300 backdrop-blur">
                                        <Sparkles
                                            size={
                                                20
                                            }
                                        />
                                    </div>

                                    <span className="absolute right-4 top-4 rounded-full border border-white/[0.07] bg-black/30 px-2.5 py-1 text-[10px] text-zinc-500 backdrop-blur">
                                        Set{" "}
                                        {aesthetic.profileSetId ||
                                            "—"}
                                    </span>
                                </div>

                                <div className="p-5">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                        {
                                            aesthetic.aestheticId
                                        }
                                        {aesthetic.moodId
                                            ? ` • ${aesthetic.moodId}`
                                            : ""}
                                    </p>

                                    <h2 className="mt-2 truncate text-lg font-semibold text-zinc-200 transition group-hover:text-white">
                                        {
                                            aesthetic.name
                                        }
                                    </h2>

                                    {aesthetic.usernameIdea && (
                                        <p className="mt-2 truncate font-mono text-sm text-zinc-500">
                                            @
                                            {
                                                aesthetic.usernameIdea
                                            }
                                        </p>
                                    )}

                                    {aesthetic.palette.length >
                                        0 && (
                                        <div className="mt-5 flex h-9 overflow-hidden rounded-xl border border-white/[0.06]">
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
                                    )}

                                    <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4 text-xs text-zinc-600">
                                        <span>
                                            Saved{" "}
                                            {formatDate(
                                                aesthetic.createdAt
                                            )}
                                        </span>

                                        <span className="text-violet-500 opacity-0 transition group-hover:opacity-100">
                                            Open →
                                        </span>
                                    </div>
                                </div>
                            </a>
                        )
                    )}
                </div>
            )}
        </>
    );
}