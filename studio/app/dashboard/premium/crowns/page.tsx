import {
    cookies,
} from "next/headers";

import {
    ArrowLeft,
    ArrowDownLeft,
    ArrowUpRight,
    CircleSlash,
    Crown,
    LockKeyhole,
    SlidersHorizontal,
    Zap,
} from "lucide-react";

import StatCard from "../../../../components/dashboard/StatCard";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    getCrownBalance,
    getCrownHistory,
    type CrownTransactionRow,
} from "../../../../lib/crowns";

import {
    FEATURE_IDS,
    FEATURES,
    getFeatureConfig,
    isFeatureId,
} from "../../../../lib/features";

import {
    getUnlockSummary,
    type UnlockSummaryRow,
} from "../../../../lib/unlocks";

import {
    getEarnStatus,
    type EarnSourceStatus,
} from "../../../../lib/crownEarning";

import {
    crownDevToolsEnabled,
} from "../../../../lib/devTools";

const TYPE_LABELS: Record<
    string,
    {
        label: string;
        className: string;
    }
> = {
    EARN: {
        label: "Earned",
        className:
            "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    },

    SPEND: {
        label: "Spent",
        className:
            "border-violet-500/20 bg-violet-500/10 text-violet-300",
    },

    REFUND: {
        label: "Refunded",
        className:
            "border-sky-500/20 bg-sky-500/10 text-sky-300",
    },

    ADJUSTMENT: {
        label: "Adjustment",
        className:
            "border-amber-500/20 bg-amber-500/10 text-amber-300",
    },
};

function formatDateTime(
    value: Date
): string {
    return value.toLocaleString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }
    );
}

/**
 * "3 left today" / "Earned out for today".
 *
 * The remaining count is the only part a user can act on, so it leads;
 * the cap is left out because seeing "0 left" already implies it.
 */
function describeRemaining(
    source: EarnSourceStatus
): string {
    if (source.remaining <= 0) {
        return "Earned out for today";
    }

    return `${source.remaining} left today`;
}

/**
 * Human wording for a live unlock.
 *
 * A boost is extra allowance inside the current period, so it is
 * described in uses; a timed unlock is a window of access, so it is
 * described in dates. Showing the wrong unit would make a purchase
 * look like it had done something different from what it did.
 */
function describeUnlock(
    row: UnlockSummaryRow
): string | null {
    if (!isFeatureId(row.feature)) {
        return null;
    }

    const config =
        getFeatureConfig(row.feature);

    if (row.kind === "BOOST") {
        return row.allowance === null
            ? null
            : `+${row.allowance} ${config.label} this period`;
    }

    if (!row.expiresAt) {
        return null;
    }

    return `${config.label} unlocked until ${formatDateTime(
        row.expiresAt
    )}`;
}

export default async function PremiumCrownsPage() {
    const cookieStore =
        await cookies();

    const cookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return null;
    }

    const identity =
        await verifySessionToken(
            cookie.value
        );

    if (!identity) {
        return null;
    }

    const [
        balance,
        history,
        unlocks,
        earnStatus,
    ] =
        await Promise.all([
            getCrownBalance(
                identity.discordId
            ),

            getCrownHistory(
                identity.discordId
            ),

            getUnlockSummary(
                identity.discordId
            ),

            getEarnStatus(
                identity.discordId
            ),
        ]);

    const devEnabled =
        crownDevToolsEnabled(
            identity.discordId
        );

    return (
        <>
            <a
                href="/dashboard/premium"
                className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300"
            >
                <ArrowLeft
                    size={14}
                />

                Back to Premium
            </a>

            <section className="mt-4 rounded-3xl border border-white/[0.06] bg-[#101015] px-7 py-7">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-400/80">
                    Crowns
                </p>

                <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {
                                balance.balance
                            }{" "}
                            <span className="text-lg font-medium text-zinc-500">
                                Crowns
                            </span>
                        </h1>

                        <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                            Crowns are spent on individual premium
                            actions instead of a subscription. The
                            balance is the sum of every transaction
                            below, so it can never drift from its
                            history.
                        </p>
                    </div>
                </div>
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-3">
                <StatCard
                    label="Balance"
                    value={
                        balance.balance
                    }
                    detail="Available to spend"
                    icon={Crown}
                />

                <StatCard
                    label="Earned"
                    value={
                        balance.earned
                    }
                    detail="All time"
                    icon={ArrowDownLeft}
                />

                <StatCard
                    label="Spent"
                    value={
                        balance.spent
                    }
                    detail="All time"
                    icon={ArrowUpRight}
                />
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    What Crowns cost
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {
                        FEATURE_IDS.map(
                            (feature) => ({
                                feature,
                                config:
                                    FEATURES[
                                        feature
                                    ],
                            })
                        )
                            .filter(
                                (entry) =>
                                    entry.config.crownCost !==
                                    null
                            )
                            .map(
                                ({
                                    feature,
                                    config,
                                }) => (
                                    <div
                                        key={
                                            feature
                                        }
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-[#0c0c11] px-4 py-3"
                                    >
                                        <span className="text-sm text-zinc-300">
                                            {
                                                config.label
                                            }
                                        </span>

                                        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-amber-300">
                                            <Crown
                                                size={13}
                                            />

                                            {
                                                config.crownCost
                                            }
                                        </span>
                                    </div>
                                )
                            )
                    }
                </div>

                <p className="mt-4 text-xs leading-6 text-zinc-600">
                    These prices are placeholders held in one place
                    inside the feature registry and are expected to
                    change before the economy is finalised.
                </p>
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Earning Crowns
                        </p>

                        <p className="mt-2 max-w-2xl text-xs leading-6 text-zinc-500">
                            Crowns come from participating: publishing
                            work, getting engagement on it, and turning
                            up day to day. Each source has its own
                            daily limit, and everything together is
                            capped per day, so the balance reflects
                            activity rather than how long a tab has
                            been open.
                        </p>
                    </div>

                    <div className="text-right">
                        <p className="text-sm font-semibold text-zinc-200 tabular-nums">
                            {earnStatus.earnedToday}
                            <span className="text-zinc-600">
                                {" / "}
                                {earnStatus.dailyCap}
                            </span>
                        </p>

                        <p className="mt-1 text-[11px] text-zinc-600">
                            earned today
                        </p>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {earnStatus.sources.map(
                        (source: EarnSourceStatus) => {
                            const maxed =
                                source.remaining <= 0 ||
                                earnStatus.dailyRemaining <= 0;

                            return (
                                <div
                                    key={source.source}
                                    className={
                                        "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 " +
                                        (maxed
                                            ? "border-white/[0.04] bg-[#0c0c11] opacity-60"
                                            : "border-white/[0.06] bg-[#0c0c11]")
                                    }
                                >
                                    <span className="min-w-0 text-sm text-zinc-300">
                                        {source.label}
                                    </span>

                                    <span className="shrink-0 text-right">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                                            <Crown
                                                size={13}
                                            />

                                            {source.amount}
                                        </span>

                                        <span className="mt-0.5 block text-[11px] text-zinc-600">
                                            {describeRemaining(
                                                source
                                            )}
                                        </span>
                                    </span>
                                </div>
                            );
                        }
                    )}
                </div>

                <p className="mt-4 text-xs leading-6 text-zinc-600">
                    Daily limits reset at 00:00 UTC. Amounts are
                    placeholders in{" "}
                    <code className="rounded bg-white/[0.05] px-1 py-0.5 text-[11px]">
                        studio/lib/crownEarning.ts
                    </code>{" "}
                    and are expected to change before the economy is
                    finalised.
                </p>
            </section>

            {
                unlocks.length > 0 && (
                    <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Active unlocks
                        </p>

                        <p className="mt-2 text-xs leading-6 text-zinc-500">
                            Extra allowance and temporary access you
                            have already paid for. Boosts expire when
                            the period resets; timed unlocks expire on
                            their own date.
                        </p>

                        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                            {unlocks.map((row) => {
                                const description =
                                    describeUnlock(row);

                                if (!description) {
                                    return null;
                                }

                                const isBoost =
                                    row.kind === "BOOST";

                                return (
                                    <li
                                        key={row.id}
                                        className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#0c0c11] px-4 py-3"
                                    >
                                        <span className="mt-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-amber-300">
                                            {isBoost ? (
                                                <Zap size={14} />
                                            ) : (
                                                <LockKeyhole size={14} />
                                            )}
                                        </span>

                                        <div className="min-w-0">
                                            <p className="text-sm text-zinc-200">
                                                {description}
                                            </p>

                                            <p className="mt-1 text-[11px] text-zinc-600">
                                                Purchased{" "}
                                                {formatDateTime(
                                                    row.createdAt
                                                )}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )
            }

            {
                devEnabled && (
                    <section className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-6">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                            <SlidersHorizontal
                                size={15}
                            />

                            Development transactions
                        </div>

                        <p className="mt-2 text-xs leading-6 text-amber-200/70">
                            Reward rules are not finalised, so this
                            panel only appears when the deployment
                            sets <code>CROWN_DEV=&quot;true&quot;</code>.
                            Use it to seed a balance for testing.
                        </p>

                        <form
                            action="/api/crowns/dev-grant"
                            method="post"
                            className="mt-4 flex flex-wrap items-center gap-3"
                        >
                            <input
                                type="number"
                                name="amount"
                                defaultValue={100}
                                min={1}
                                max={1000}
                                className="w-32 rounded-xl border border-white/[0.08] bg-[#0c0c11] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/40"
                            />

                            <button
                                type="submit"
                                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
                            >
                                Grant test Crowns
                            </button>
                        </form>
                    </section>
                )
            }

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Transaction history
                </p>

                {
                    history.length === 0 ? (
                        <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-white/[0.06] bg-[#0c0c11] p-6">
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-zinc-500">
                                <CircleSlash
                                    size={18}
                                />
                            </div>

                            <p className="text-sm text-zinc-400">
                                No Crown transactions yet.
                            </p>

                            <p className="text-xs leading-6 text-zinc-600">
                                Publish something to Discover, or
                                collect the daily visit, and the first
                                rows will show up here.
                            </p>
                        </div>
                    ) : (
                        <ul className="mt-5 divide-y divide-white/[0.05]">
                            {
                                history.map(
                                    (row: CrownTransactionRow) => {
                                        const meta =
                                            TYPE_LABELS[
                                                row.type
                                            ] ??
                                            TYPE_LABELS.ADJUSTMENT;

                                        return (
                                            <li
                                                key={
                                                    row.id
                                                }
                                                className="flex items-center justify-between gap-4 py-3"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm text-zinc-200">
                                                        {
                                                            row.reason
                                                        }
                                                    </p>

                                                    <p className="mt-1 text-xs text-zinc-600">
                                                        {
                                                            formatDateTime(
                                                                row.createdAt
                                                            )
                                                        }

                                                        {
                                                            row.source && (
                                                                <>
                                                                    {" · "}
                                                                    {
                                                                        row.source
                                                                    }
                                                                </>
                                                            )
                                                        }
                                                    </p>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-3">
                                                    <span
                                                        className={
                                                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                                                            meta.className
                                                        }
                                                    >
                                                        {
                                                            meta.label
                                                        }
                                                    </span>

                                                    <span
                                                        className={
                                                            "w-14 text-right text-sm font-semibold tabular-nums " +
                                                            (
                                                                row.amount >= 0
                                                                    ? "text-emerald-300"
                                                                    : "text-zinc-300"
                                                            )
                                                        }
                                                    >
                                                        {
                                                            row.amount >= 0
                                                                ? `+${row.amount}`
                                                                : row.amount
                                                        }
                                                    </span>
                                                </div>
                                            </li>
                                        );
                                    }
                                )
                            }
                        </ul>
                    )
                }
            </section>
        </>
    );
}
