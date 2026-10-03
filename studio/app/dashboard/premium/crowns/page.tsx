import {
    cookies,
} from "next/headers";

import {
    ArrowLeft,
    ArrowDownLeft,
    ArrowUpRight,
    CircleSlash,
    Crown,
    SlidersHorizontal,
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
} from "../../../../lib/features";

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

    const [balance, history] =
        await Promise.all([
            getCrownBalance(
                identity.discordId
            ),

            getCrownHistory(
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
                                Earning rules are still being decided,
                                so nothing awards Crowns automatically
                                at the moment.
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
