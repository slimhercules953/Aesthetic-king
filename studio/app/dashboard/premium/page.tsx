import {
    cookies,
} from "next/headers";

import {
    Crown,
    Gauge,
    History,
    Sparkles,
    Ticket,
} from "lucide-react";

import StatCard from "../../../components/dashboard/StatCard";
import UsageMeter from "../../../components/dashboard/UsageMeter";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    getEntitlementSummary,
} from "../../../lib/entitlements";

import {
    getFeatureAccessMany,
} from "../../../lib/featureAccess";

import {
    getCrownBalance,
} from "../../../lib/crowns";

import {
    FEATURE_IDS,
} from "../../../lib/features";

function formatDate(
    value: Date | null
): string {
    if (!value) {
        return "";
    }

    return value.toLocaleDateString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric",
        }
    );
}

export default async function PremiumOverviewPage() {
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

    const discordId =
        identity.discordId;

    const [
        entitlements,
        crowns,
        access,
    ] = await Promise.all([
        getEntitlementSummary(
            discordId
        ),

        getCrownBalance(
            discordId
        ),

        getFeatureAccessMany(
            discordId,
            [...FEATURE_IDS]
        ),
    ]);

    const isPremium =
        entitlements.plan ===
        "PREMIUM";

    const metered =
        FEATURE_IDS.map(
            (feature) =>
                access[feature]
        ).filter(
            (entry) =>
                entry.kind ===
                "metered"
        );

    const gated =
        FEATURE_IDS.map(
            (feature) =>
                access[feature]
        ).filter(
            (entry) =>
                entry.kind ===
                "gated"
        );

    const nearLimit =
        metered.filter(
            (entry) =>
                entry.tracked &&
                entry.remaining !== null &&
                entry.remaining > 0 &&
                entry.remaining <= 2
        );

    return (
        <>
            <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015] px-7 py-8 lg:px-9">
                <div className="pointer-events-none absolute -right-32 -top-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

                <div className="relative">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
                        Membership
                    </p>

                    <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                                {
                                    isPremium
                                        ? "Premium is active"
                                        : "You are on Free"
                                }
                            </h1>

                            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                                {
                                    !isPremium
                                        ? "Free keeps the core Studio workflow available. Premium raises the allowances and unlocks the advanced tools."
                                        : !entitlements.isPromotional
                                            ? "Every Premium allowance below is unlocked on this account."
                                            : entitlements.premium?.endsAt
                                                ? "Your Premium access was granted rather than purchased, so it ends on the date shown and will not renew itself."
                                                : "Your Premium access was granted rather than purchased, and has no end date."
                                }
                            </p>

                            {
                                isPremium &&
                                entitlements.renewsAt && (
                                    <p className="mt-3 text-xs text-zinc-600">
                                        {
                                            entitlements.premium?.endsAt
                                                ? `Access listed through ${formatDate(
                                                    entitlements.premium.endsAt
                                                )}`
                                                : "No end date recorded."
                                        }
                                    </p>
                                )
                            }
                        </div>

                        <div className="flex flex-wrap gap-3">
                            {
                                !isPremium && (
                                    <a
                                        href="/dashboard/premium/billing"
                                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5"
                                    >
                                        <Sparkles
                                            size={17}
                                        />

                                        Explore Premium
                                    </a>
                                )
                            }

                            <a
                                href="/dashboard/premium/crowns"
                                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06]"
                            >
                                <Crown
                                    size={17}
                                />

                                {
                                    crowns.balance
                                }{" "}
                                Crowns
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Plan"
                    value={
                        isPremium
                            ? "Premium"
                            : "Free"
                    }
                    detail={
                        entitlements.premium?.source ??
                        "No active entitlement"
                    }
                    icon={Sparkles}
                />

                <StatCard
                    label="Crown balance"
                    value={
                        crowns.balance
                    }
                    detail={`${crowns.earned} earned · ${crowns.spent} spent`}
                    icon={Crown}
                />

                <StatCard
                    label="Metered features"
                    value={
                        metered.length
                    }
                    detail={
                        nearLimit.length > 0
                            ? `${nearLimit.length} near their limit`
                            : "All within limits"
                    }
                    icon={Gauge}
                />

                <StatCard
                    label="Premium tools"
                    value={
                        gated.length
                    }
                    detail={
                        isPremium
                            ? "Unlocked"
                            : "Locked or Crown-priced"
                    }
                    icon={Ticket}
                />
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Allowances
                        </p>

                        <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                            What you use
                        </h2>
                    </div>

                    <a
                        href="/dashboard/premium/usage"
                        className="inline-flex items-center gap-2 text-xs font-semibold text-violet-300 transition hover:text-violet-200"
                    >
                        <History
                            size={14}
                        />

                        Full usage detail
                    </a>
                </div>

                <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {
                        metered.map(
                            (entry) => (
                                <UsageMeter
                                    key={
                                        entry.feature
                                    }
                                    access={
                                        entry
                                    }
                                />
                            )
                        )
                    }
                </div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Premium tools
                </p>

                <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                    What Premium unlocks
                </h2>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {
                        gated.map(
                            (entry) => (
                                <div
                                    key={
                                        entry.feature
                                    }
                                    className="rounded-2xl border border-white/[0.06] bg-[#0c0c11] p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="text-sm font-medium text-zinc-200">
                                            {
                                                entry.label
                                            }
                                        </p>

                                        {
                                            entry.allowed ? (
                                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                                                    Ready
                                                </span>
                                            ) : entry.crownCost ? (
                                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                                                    {
                                                        entry.crownCost
                                                    }{" "}
                                                    Crowns
                                                </span>
                                            ) : (
                                                <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                                    Premium
                                                </span>
                                            )
                                        }
                                    </div>

                                    <p className="mt-2 text-xs leading-6 text-zinc-500">
                                        {
                                            entry.description
                                        }
                                    </p>
                                </div>
                            )
                        )
                    }
                </div>
            </section>
        </>
    );
}
