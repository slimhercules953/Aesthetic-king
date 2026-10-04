import {
    dashboardMetadata,
} from "../../lib/pageMetadata";

import {
    cookies,
} from "next/headers";

import {
    Boxes,
    Database,
    Palette,
    Plus,
    Sparkles,
} from "lucide-react";

import StatCard from "../../components/dashboard/StatCard";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../lib/session";

import {
    getSavedAestheticsByDiscordId,
} from "../../lib/savedAesthetics";

export const metadata =
    dashboardMetadata(
        "Overview",
        "Everything you have made, what you have published, and what needs attention next."
    );

export default async function DashboardPage() {
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

    const recent =
        aesthetics.slice(
            0,
            3
        );

    return (
        <>
            <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015] px-7 py-8 lg:px-9 lg:py-10">
                <div className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

                <div className="pointer-events-none absolute right-32 top-10 h-48 w-48 rounded-full bg-fuchsia-500/[0.06] blur-3xl" />

                <div className="relative">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
                        Aesthetic King Studio
                    </p>

                    <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                        Welcome back,{" "}
                        <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                            {
                                session.username
                            }
                        </span>
                    </h1>

                    <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                        Create, organize, and perfect your Discord aesthetic from one place.
                    </p>

                    <div className="mt-7 flex flex-wrap gap-3">
                        <a
                            href="/dashboard/create"
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5 hover:shadow-violet-500/25"
                        >
                            <Plus
                                size={
                                    17
                                }
                            />

                            Create Aesthetic
                        </a>

                        <a
                            href="/dashboard/aesthetics"
                            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                        >
                            <Sparkles
                                size={
                                    17
                                }
                            />

                            My Aesthetics
                        </a>
                    </div>
                </div>
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Saved Aesthetics"
                    value={
                        aesthetics.length
                    }
                    detail="Across Discord and Studio"
                    icon={
                        Sparkles
                    }
                />

                <StatCard
                    label="Asset Sets"
                    value="64"
                    detail="Current matching profile sets"
                    icon={
                        Boxes
                    }
                />

                <StatCard
                    label="Database"
                    value="Online"
                    detail="Hyperdrive connected"
                    icon={
                        Database
                    }
                />

                <StatCard
                    label="Palette Studio"
                    value="Ready"
                    detail="Color tools available"
                    icon={
                        Palette
                    }
                />
            </section>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
                <section className="rounded-3xl border border-white/[0.06] bg-[#101015]">
                    <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-5">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                Library
                            </p>

                            <h2 className="mt-1 text-xl font-semibold">
                                Recent Aesthetics
                            </h2>
                        </div>

                        <a
                            href="/dashboard/aesthetics"
                            className="text-sm text-violet-400 transition hover:text-violet-300"
                        >
                            View all
                        </a>
                    </div>

                    {recent.length ===
                    0 ? (
                        <div className="p-8">
                            <p className="text-zinc-400">
                                You haven&apos;t saved an aesthetic yet.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.05]">
                            {recent.map(
                                (
                                    aesthetic
                                ) => (
                                    <a
                                        key={
                                            aesthetic.id
                                        }
                                        href={`/dashboard/aesthetics/${aesthetic.id}`}
                                        className="group flex items-center gap-5 px-6 py-5 transition hover:bg-white/[0.025]"
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-400">
                                            <Sparkles
                                                size={
                                                    19
                                                }
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-medium text-zinc-200 transition group-hover:text-white">
                                                {
                                                    aesthetic.name
                                                }
                                            </p>

                                            <p className="mt-1 truncate text-sm text-zinc-600">
                                                {aesthetic.usernameIdea ||
                                                    aesthetic.aestheticId}
                                            </p>
                                        </div>

                                        <div className="hidden overflow-hidden rounded-lg border border-white/[0.06] sm:flex">
                                            {aesthetic.palette
                                                .slice(
                                                    0,
                                                    5
                                                )
                                                .map(
                                                    (
                                                        color,
                                                        index
                                                    ) => (
                                                        <span
                                                            key={`${color}-${index}`}
                                                            className="h-8 w-7"
                                                            style={{
                                                                backgroundColor:
                                                                    color,
                                                            }}
                                                        />
                                                    )
                                                )}
                                        </div>
                                    </a>
                                )
                            )}
                        </div>
                    )}
                </section>

                <div className="space-y-6">
                    <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Quick Create
                        </p>

                        <h2 className="mt-2 text-xl font-semibold">
                            Build something new
                        </h2>

                        <div className="mt-5 space-y-2">
                            <a
                                href="/dashboard/create"
                                className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-zinc-300 transition hover:border-violet-500/20 hover:bg-violet-500/[0.05]"
                            >
                                <Sparkles
                                    size={
                                        18
                                    }
                                    className="text-violet-400"
                                />

                                Complete Aesthetic
                            </a>

                            <a
                                href="/dashboard/palettes"
                                className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-zinc-300 transition hover:border-violet-500/20 hover:bg-violet-500/[0.05]"
                            >
                                <Palette
                                    size={
                                        18
                                    }
                                    className="text-fuchsia-400"
                                />

                                Color Palette
                            </a>
                        </div>
                    </section>

                    <section className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-[#101015] to-fuchsia-500/[0.05] p-6">
                        <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />

                        <div className="relative">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">
                                Aesthetic King Pro
                            </p>

                            <h2 className="mt-3 text-xl font-semibold">
                                Take your aesthetic further.
                            </h2>

                            <p className="mt-3 text-sm leading-6 text-zinc-400">
                                Advanced editing, image analysis, collections, history, premium assets, and Server Studio.
                            </p>

                            <a
                                href="/dashboard/premium"
                                className="mt-5 inline-flex rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-300 transition hover:bg-violet-500/15"
                            >
                                Explore Pro
                            </a>
                        </div>
                    </section>
                </div>
            </div>
        </>
    );
}