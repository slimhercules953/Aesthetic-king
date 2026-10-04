import {
    cookies,
} from "next/headers";

import {
    BarChart3,
    Compass,
    Crown,
    Eye,
    Heart,
    MessageCircle,
    Sparkles,
    TrendingUp,
    Users,
} from "lucide-react";

import UpgradePrompt from "../../../components/ui/UpgradePrompt";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    getFeatureAccess,
} from "../../../lib/featureAccess";

import {
    buildDeniedBody,
} from "../../../lib/gate";

import {
    getCreatorAnalytics,
    type AnalyticsPostRow,
} from "../../../lib/creatorAnalytics";

import {
    creatorProfileHref,
} from "../../../lib/creatorHref";

/**
 * Creator Analytics — the last piece of Phase 7.
 *
 * Premium-only, and the gate is enforced here rather than by hiding the nav
 * entry: the page only ever reads the signed-in account's own numbers, so a
 * forged visit could not see anyone else's data, but the feature is sold as
 * Premium and a page reachable by URL has to hold that line itself.
 *
 * The window switch changes the trend and the per-post "in this window"
 * column. The headline totals stay lifetime on purpose — see the note in
 * `lib/creatorAnalytics.ts`.
 */

const WINDOWS = [
    {
        label: "7 days",
        value: 7,
    },
    {
        label: "30 days",
        value: 30,
    },
    {
        label: "90 days",
        value: 90,
    },
];

const DEFAULT_WINDOW = 30;

const TYPE_LABELS: Record<string, string> = {
    AESTHETIC: "Profile",
    PALETTE: "Palette",
    ASSET: "Asset set",
};

function parseWindow(
    value: string | string[] | undefined
): number {
    const raw = Array.isArray(value)
        ? value[0]
        : value;

    const parsed = Number(raw);

    return WINDOWS.some(
        (entry) => entry.value === parsed
    )
        ? parsed
        : DEFAULT_WINDOW;
}

function compact(
    value: number
): string {
    return new Intl.NumberFormat(
        "en-US",
        {
            notation:
                value >= 10_000
                    ? "compact"
                    : "standard",
            maximumFractionDigits: 1,
        }
    ).format(
        value
    );
}

function percent(
    part: number,
    whole: number
): string {
    if (whole <= 0) {
        return "—";
    }

    return `${Math.round(
        (part / whole) * 100
    )}%`;
}

function shortDay(
    day: string
): string {
    /*
     * DATE_TRUNC('day', ...)::date renders as "2026-10-04", which parses as
     * UTC midnight. Reading it back with a UTC-aware formatter keeps the
     * label on the same calendar day the bucket used, rather than sliding it
     * a day for viewers west of Greenwich.
     */
    const date = new Date(
        `${day}T00:00:00Z`
    );

    if (Number.isNaN(date.getTime())) {
        return day;
    }

    return new Intl.DateTimeFormat(
        "en-US",
        {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
        }
    ).format(
        date
    );
}

function sinceDate(
    date: Date | null
): string | null {
    if (!date) {
        return null;
    }

    return new Intl.DateTimeFormat(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
        }
    ).format(
        date
    );
}

function itemHref(
    row: AnalyticsPostRow
): string {
    /*
     * Only profile posts have a detail route. Palettes are edited from the
     * library page and asset sets from the catalog, and neither is reachable
     * from a post id, so the feed — where the post actually lives — is the
     * honest target.
     */
    return row.itemType === "AESTHETIC"
        ? `/dashboard/aesthetics/${row.itemId}`
        : "/dashboard/discover";
}

export default async function CreatorAnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{
        window?: string | string[];
    }>;
}) {
    const cookieStore =
        await cookies();

    const cookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return null;
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return null;
    }

    const { window: rawWindow } =
        await searchParams;

    const days =
        parseWindow(rawWindow);

    const access =
        await getFeatureAccess(
            session.discordId,
            "CREATOR_ANALYTICS"
        );

    /*
     * Denied before the numbers are read at all. Teasing a free account with
     * "you have 412 views, pay to see where they came from" is the version of
     * this page that reads as a dark pattern, and it is also the version that
     * pays for a four-table aggregate on every visit from someone who cannot
     * use the result.
     */
    if (!access.allowed) {
        /*
         * `plan` is lowercased to match the client-side denial shape
         * `UpgradePrompt` expects, the same conversion the premium asset
         * detail page makes.
         */
        const denied = {
            ...buildDeniedBody(access),
            plan:
                access.plan === "PREMIUM"
                    ? ("premium" as const)
                    : ("free" as const),
        };

        return (
            <>
                <Header />

                <div className="mt-8">
                    <UpgradePrompt
                        denied={denied}
                    />
                </div>

                <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300">
                        <BarChart3
                            size={28}
                        />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold text-zinc-200">
                        Your numbers live here
                    </h2>

                    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                        Who has seen your work, which posts earned the most
                        likes, and how many people rebuilt something from it.
                        Views are already being recorded, so the history is
                        waiting for you.
                    </p>

                    <a
                        href="/dashboard/discover"
                        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                    >
                        <Compass
                            size={15}
                        />

                        Browse Discover
                    </a>
                </div>
            </>
        );
    }

    const analytics =
        await getCreatorAnalytics(
            session.discordId,
            { days }
        );

    if (!analytics) {
        return null;
    }

    const {
        totals,
        posts,
        trend,
        firstViewAt,
    } = analytics;

    const peak = Math.max(
        1,
        ...trend.map(
            (point) => point.views
        )
    );

    const stats = [
        {
            label: "People reached",
            value: compact(totals.reach),
            hint: "Accounts that saw your work",
            icon: Users,
        },
        {
            label: "Views",
            value: compact(totals.views),
            hint: "Including repeat views",
            icon: Eye,
        },
        {
            label: "Likes",
            value: compact(totals.likes),
            hint:
                `${percent(
                    totals.likes,
                    totals.reach
                )} of people who saw it`,
            icon: Heart,
        },
        {
            label: "Comments",
            value: compact(totals.comments),
            hint: "Replies on your posts",
            icon: MessageCircle,
        },
        {
            label: "Remixes",
            value: compact(totals.remixes),
            hint:
                `${percent(
                    totals.remixes,
                    totals.reach
                )} of people who saw it`,
            icon: Sparkles,
        },
    ];

    const firstDay =
        trend[0]?.day;

    const lastDay =
        trend[trend.length - 1]?.day;

    const profileHref =
        creatorProfileHref(session.discordId);

    return (
        <>
            <Header />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <div className="inline-flex rounded-xl border border-white/[0.06] bg-[#101015] p-1">
                    {WINDOWS.map(
                        (entry) => (
                            <a
                                key={entry.value}
                                href={`/dashboard/analytics?window=${entry.value}`}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    entry.value === days
                                        ? "bg-violet-500/15 text-violet-200"
                                        : "text-zinc-500 hover:text-zinc-300"
                                }`}
                            >
                                {entry.label}
                            </a>
                        )
                    )}
                </div>

                {profileHref ? (
                    <a
                        href={profileHref}
                        className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300"
                    >
                        <Compass
                            size={14}
                        />

                        View my public page
                    </a>
                ) : null}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {stats.map(
                    (stat) => (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-white/[0.06] bg-[#101015] px-5 py-5"
                        >
                            <div className="flex items-center gap-2 text-violet-400">
                                <stat.icon
                                    size={15}
                                />

                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                    {stat.label}
                                </p>
                            </div>

                            <p className="mt-3 text-3xl font-bold tracking-tight text-zinc-100">
                                {stat.value}
                            </p>

                            <p className="mt-1 text-xs text-zinc-600">
                                {stat.hint}
                            </p>
                        </div>
                    )
                )}
            </div>

            <section className="mt-8 rounded-3xl border border-white/[0.06] bg-[#101015] px-6 py-6">
                <div className="flex items-center gap-2">
                    <TrendingUp
                        size={16}
                        className="text-violet-400"
                    />

                    <h2 className="font-semibold text-zinc-200">
                        Views over the last {days} days
                    </h2>
                </div>

                {trend.every(
                    (point) => point.views === 0
                ) ? (
                    <p className="mt-6 text-sm text-zinc-600">
                        No views recorded yet. Once someone scrolls past your
                        work in Discover it will show up here.
                    </p>
                ) : (
                    <>
                        <div className="mt-6 flex h-40 items-end gap-1">
                            {trend.map(
                                (point) => (
                                    <div
                                        key={point.day}
                                        title={`${shortDay(point.day)} — ${point.views} views, ${point.reach} new viewers`}
                                        className="flex-1 rounded-t bg-gradient-to-t from-violet-600/40 to-fuchsia-500/60 transition hover:from-violet-500/60 hover:to-fuchsia-400/80"
                                        style={{
                                            height: `${Math.max(
                                                (point.views / peak) * 100,
                                                4
                                            )}%`,
                                            opacity:
                                                point.views > 0
                                                    ? 1
                                                    : 0.15,
                                        }}
                                    />
                                )
                            )}
                        </div>

                        <div className="mt-3 flex justify-between text-[11px] text-zinc-600">
                            <span>
                                {firstDay
                                    ? shortDay(firstDay)
                                    : ""}
                            </span>

                            <span>
                                {lastDay
                                    ? shortDay(lastDay)
                                    : ""}
                            </span>
                        </div>
                    </>
                )}
            </section>

            <section className="mt-8 overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                <div className="flex items-center gap-2 px-6 py-5">
                    <BarChart3
                        size={16}
                        className="text-violet-400"
                    />

                    <h2 className="font-semibold text-zinc-200">
                        Best performing posts
                    </h2>
                </div>

                {posts.length === 0 ? (
                    <p className="px-6 pb-8 text-sm text-zinc-600">
                        Nothing published yet. Share something from your
                        library and it starts collecting views immediately.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-t border-white/[0.06] text-left text-[11px] uppercase tracking-[0.14em] text-zinc-600">
                                    <th className="px-6 py-3 font-semibold">
                                        Post
                                    </th>

                                    <th className="px-3 py-3 text-right font-semibold">
                                        People
                                    </th>

                                    <th className="px-3 py-3 text-right font-semibold">
                                        Views
                                    </th>

                                    <th className="px-3 py-3 text-right font-semibold">
                                        {`${days}d`}
                                    </th>

                                    <th className="px-3 py-3 text-right font-semibold">
                                        Likes
                                    </th>

                                    <th className="px-3 py-3 text-right font-semibold">
                                        Comments
                                    </th>

                                    <th className="px-6 py-3 text-right font-semibold">
                                        Remixes
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {posts.map(
                                    (row) => (
                                        <tr
                                            key={row.postId}
                                            className="border-t border-white/[0.04]"
                                        >
                                            <td className="max-w-[18rem] px-6 py-3">
                                                <a
                                                    href={itemHref(row)}
                                                    className="block truncate font-medium text-zinc-200 transition hover:text-violet-300"
                                                >
                                                    {row.caption ||
                                                        TYPE_LABELS[
                                                            row.itemType
                                                        ] ||
                                                        "Untitled"}
                                                </a>

                                                <p className="mt-0.5 text-[11px] text-zinc-600">
                                                    {
                                                        TYPE_LABELS[
                                                            row.itemType
                                                        ]
                                                    }
                                                </p>
                                            </td>

                                            <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                                                {compact(row.reach)}
                                            </td>

                                            <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                                                {compact(row.views)}
                                            </td>

                                            <td className="px-3 py-3 text-right tabular-nums text-zinc-500">
                                                {compact(row.windowViews)}
                                            </td>

                                            <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                                                {compact(row.likes)}
                                            </td>

                                            <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                                                {compact(row.comments)}
                                            </td>

                                            <td className="px-6 py-3 text-right tabular-nums text-zinc-300">
                                                {compact(row.remixes)}
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <p className="mt-6 flex items-center gap-2 text-[11px] text-zinc-600">
                <Crown
                    size={12}
                    className="text-amber-400/70"
                />

                Views count signed-in accounts, not page loads, and never
                include your own.
                {sinceDate(firstViewAt)
                    ? ` Tracking started ${sinceDate(firstViewAt)}.`
                    : ""}
            </p>
        </>
    );
}

function Header() {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                Community
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Creator Analytics
            </h1>

            <p className="mt-3 max-w-2xl text-zinc-500">
                How your published work performs in the Discover feed.
            </p>
        </div>
    );
}
