"use client";

import {
    Activity,
    BarChart3,
    Crown,
    LoaderCircle,
    MousePointerClick,
    Sparkles,
    Users,
} from "lucide-react";

import {
    useState,
} from "react";

import StatCard from "../dashboard/StatCard";

import type {
    AnalyticsRange,
} from "../../lib/guildAnalytics";

/*
 * Server components hand Date objects to client components intact, but the
 * range switcher refetches the same shape over JSON, where they become
 * strings. Both forms are accepted so the two paths stay interchangeable.
 */
type Timestamp = string | Date;

type AnalyticsPayload = {
    range: number;
    summary: {
        totalEvents: number;
        uniqueMembers: number;
        premiumEvents: number;
        buttonEvents: number;
        busiestDay: {
            date: string | null;
            count: number;
        };
        firstEventAt: Timestamp | null;
    };
    daily: { date: string; count: number }[];
    commands: {
        commandName: string;
        count: number;
        uniqueMembers: number;
    }[];
    members: {
        discordUserId: string;
        count: number;
        lastUsedAt: Timestamp;
    }[];
    packs: { packId: string; count: number }[];
};

const RANGES: AnalyticsRange[] = [7, 14, 30, 90];

function toDate(value: Timestamp): Date {
    return value instanceof Date
        ? value
        : new Date(value);
}

function formatDay(date: string): string {
    const parsed = toDate(`${date}T00:00:00`);

    if (Number.isNaN(parsed.getTime())) {
        return date;
    }

    return parsed.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function formatDateTime(value: Timestamp | null): string {
    if (!value) {
        return "—";
    }

    const parsed = toDate(value);

    if (Number.isNaN(parsed.getTime())) {
        return "—";
    }

    return parsed.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function peakOf(values: number[]): number {
    return values.reduce(
        (peak, value) => Math.max(peak, value),
        1
    );
}

/**
 * Bars are plain divs rather than a chart library: the rest of the Studio
 * ships without one, and a daily histogram does not justify adding a
 * dependency to a Worker bundle.
 */
function DailyChart({
    points,
}: {
    points: AnalyticsPayload["daily"];
}) {
    const peak = peakOf(
        points.map((point) => point.count)
    );

    return (
        <div className="mt-5 flex h-40 items-end gap-1">
            {points.map((point) => (
                <div
                    key={point.date}
                    className="group relative flex h-full flex-1 flex-col justify-end"
                    title={`${formatDay(point.date)} — ${point.count}`}
                >
                    <div
                        className="min-h-[2px] rounded-t bg-violet-500/50 transition group-hover:bg-violet-400"
                        style={{
                            height: `${
                                (point.count / peak) *
                                100
                            }%`,
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

type BarRow = {
    label: string;
    count: number;
    detail?: string;
};

function BarList({ rows }: { rows: BarRow[] }) {
    const peak = peakOf(
        rows.map((row) => row.count)
    );

    return (
        <ul className="mt-4 space-y-3">
            {rows.map((row) => (
                <li key={row.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-zinc-300">
                            {row.label}
                        </span>

                        <span className="shrink-0 text-xs text-zinc-500">
                            {row.detail ?? row.count}
                        </span>
                    </div>

                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                            className="h-full rounded-full bg-violet-500/60"
                            style={{
                                width: `${
                                    (row.count / peak) *
                                    100
                                }%`,
                            }}
                        />
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default function ServerAnalytics({
    guildId,
    initial,
}: {
    guildId: string;
    initial: AnalyticsPayload;
}) {
    const [analytics, setAnalytics] =
        useState(initial);

    const [loading, setLoading] = useState(false);
    const [error, setError] =
        useState<string | null>(null);

    async function loadRange(days: AnalyticsRange) {
        if (days === analytics.range || loading) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `/api/servers/${guildId}/analytics?days=${days}`
            );

            const body = await response.json() as {
                analytics?: AnalyticsPayload;
                error?: string;
            };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not load the analytics."
                );
            }

            if (body.analytics) {
                setAnalytics(body.analytics);
            }
        } catch (loadError) {
            setError(
                loadError instanceof Error
                    ? loadError.message
                    : "Could not load the analytics."
            );
        } finally {
            setLoading(false);
        }
    }

    const { summary } = analytics;

    const empty = summary.totalEvents === 0;

    const firstDay = analytics.daily.length
        ? formatDay(analytics.daily[0].date)
        : "";

    const lastDay = analytics.daily.length
        ? formatDay(
            analytics.daily[
                analytics.daily.length - 1
            ].date
        )
        : "";

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex rounded-xl border border-white/[0.06] bg-[#101015] p-1">
                    {RANGES.map((range) => (
                        <button
                            key={range}
                            type="button"
                            onClick={() =>
                                void loadRange(range)
                            }
                            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition ${
                                analytics.range ===
                                range
                                    ? "bg-violet-500/15 text-violet-300"
                                    : "text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            {range} days
                        </button>
                    ))}
                </div>

                {loading && (
                    <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                        <LoaderCircle
                            size={14}
                            className="animate-spin"
                        />

                        Updating…
                    </span>
                )}
            </div>

            {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">
                    {error}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Generations"
                    value={summary.totalEvents}
                    detail={`Last ${analytics.range} days`}
                    icon={Activity}
                />

                <StatCard
                    label="Active members"
                    value={summary.uniqueMembers}
                    detail="Ran at least one command"
                    icon={Users}
                />

                <StatCard
                    label="Reroll clicks"
                    value={summary.buttonEvents}
                    detail="Buttons pressed on results"
                    icon={MousePointerClick}
                />

                <StatCard
                    label="Premium uses"
                    value={summary.premiumEvents}
                    detail="Counted while a plan was active"
                    icon={Crown}
                />
            </div>

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold tracking-tight">
                        Daily Activity
                    </h3>

                    <p className="text-xs text-zinc-500">
                        {summary.busiestDay.date
                            ? `Busiest day: ${formatDay(
                                summary.busiestDay.date
                            )} with ${summary.busiestDay.count}`
                            : "No activity recorded yet"}
                    </p>
                </div>

                {empty ? (
                    <p className="mt-6 text-sm leading-6 text-zinc-500">
                        Nothing to chart yet. Run a command
                        in this server and it shows up here
                        within a few seconds.
                    </p>
                ) : (
                    <>
                        <DailyChart
                            points={analytics.daily}
                        />

                        <div className="mt-2 flex justify-between text-[11px] text-zinc-600">
                            <span>{firstDay}</span>

                            <span>{lastDay}</span>
                        </div>
                    </>
                )}
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center gap-2.5">
                        <BarChart3
                            size={16}
                            className="text-violet-400"
                        />

                        <h3 className="text-lg font-semibold tracking-tight">
                            Commands
                        </h3>
                    </div>

                    {analytics.commands.length === 0 ? (
                        <p className="mt-4 text-sm text-zinc-500">
                            No commands used yet.
                        </p>
                    ) : (
                        <BarList
                            rows={analytics.commands.map(
                                (command) => ({
                                    label: `/${command.commandName}`,
                                    count: command.count,
                                    detail: `${command.count} • ${command.uniqueMembers} ${
                                        command.uniqueMembers ===
                                        1
                                            ? "member"
                                            : "members"
                                    }`,
                                })
                            )}
                        />
                    )}
                </section>

                <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center gap-2.5">
                        <Sparkles
                            size={16}
                            className="text-violet-400"
                        />

                        <h3 className="text-lg font-semibold tracking-tight">
                            Most Active Members
                        </h3>
                    </div>

                    {analytics.members.length === 0 ? (
                        <p className="mt-4 text-sm text-zinc-500">
                            No members have used the bot
                            yet.
                        </p>
                    ) : (
                        <ul className="mt-4 space-y-2">
                            {analytics.members.map(
                                (member) => (
                                    <li
                                        key={
                                            member.discordUserId
                                        }
                                        className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#0b0b0f] px-4 py-2.5"
                                    >
                                        <span className="min-w-0 truncate font-mono text-xs text-zinc-400">
                                            {
                                                member.discordUserId
                                            }
                                        </span>

                                        <span className="shrink-0 text-xs text-zinc-500">
                                            {member.count}{" "}
                                            uses •{" "}
                                            {formatDateTime(
                                                member.lastUsedAt
                                            )}
                                        </span>
                                    </li>
                                )
                            )}
                        </ul>
                    )}

                    <p className="mt-4 text-[11px] leading-5 text-zinc-600">
                        Members are identified by ID only —
                        Studio does not store usernames.
                    </p>
                </section>
            </div>

            {analytics.packs.length > 0 && (
                <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center gap-2.5">
                        <Sparkles
                            size={16}
                            className="text-violet-400"
                        />

                        <h3 className="text-lg font-semibold tracking-tight">
                            Curated Packs
                        </h3>
                    </div>

                    <BarList
                        rows={analytics.packs.map(
                            (pack) => ({
                                label: pack.packId,
                                count: pack.count,
                            })
                        )}
                    />
                </section>
            )}

            {summary.firstEventAt && (
                <p className="text-xs text-zinc-600">
                    Recording started{" "}
                    {formatDateTime(
                        summary.firstEventAt
                    )}
                    .
                </p>
            )}
        </div>
    );
}
