import {
    dashboardMetadata,
} from "../../../../lib/pageMetadata";

import {
    cookies,
} from "next/headers";

import {
    ArrowLeft,
    CalendarClock,
} from "lucide-react";

import UsageMeter from "../../../../components/dashboard/UsageMeter";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    getEntitlementSummary,
} from "../../../../lib/entitlements";

import {
    getFeatureAccessMany,
} from "../../../../lib/featureAccess";

import {
    getUsageLedger,
} from "../../../../lib/usage";

import {
    FEATURE_IDS,
    getFeatureConfig,
    isFeatureId,
} from "../../../../lib/features";

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

const RESET_LABELS: Record<
    string,
    string
> = {
    daily: "Resets daily",
    weekly: "Resets weekly",
    monthly: "Resets monthly",
    never: "Lifetime allowance",
};

export const metadata =
    dashboardMetadata(
        "Usage",
        "How much of each plan allowance you have used and when it resets."
    );

export default async function PremiumUsagePage() {
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
        access,
        ledger,
    ] = await Promise.all([
        getEntitlementSummary(
            discordId
        ),

        getFeatureAccessMany(
            discordId,
            [...FEATURE_IDS]
        ),

        getUsageLedger(
            discordId
        ),
    ]);

    const metered =
        FEATURE_IDS.map(
            (feature) =>
                access[feature]
        ).filter(
            (entry) =>
                entry.kind ===
                "metered"
        );

    const tracked =
        metered.filter(
            (entry) =>
                entry.tracked
        );

    const untracked =
        metered.filter(
            (entry) =>
                !entry.tracked
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
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
                    {
                        entitlements.plan === "PREMIUM"
                            ? "Premium allowances"
                            : "Free allowances"
                    }
                </p>

                <h1 className="mt-3 text-3xl font-bold tracking-tight">
                    Usage
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                    Counters reflect what Studio actually records.
                    Anything still unwired is labeled rather than
                    shown as an empty bar.
                </p>
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Tracked
                </p>

                <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {
                        tracked.map(
                            (entry) => (
                                <div
                                    key={
                                        entry.feature
                                    }
                                >
                                    <UsageMeter
                                        access={
                                            entry
                                        }
                                    />

                                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-zinc-600">
                                        <CalendarClock
                                            size={12}
                                        />

                                        {
                                            RESET_LABELS[
                                                entry.resetPeriod
                                            ]
                                        }

                                        {
                                            entry.resetAt &&
                                            entry.resetPeriod !==
                                                "never" && (
                                                <>
                                                    {" · "}
                                                    {
                                                        entry.resetAt.toLocaleDateString(
                                                            "en-US",
                                                            {
                                                                month: "short",
                                                                day: "numeric",
                                                            }
                                                        )
                                                    }
                                                </>
                                            )
                                        }
                                    </p>
                                </div>
                            )
                        )
                    }
                </div>
            </section>

            {
                untracked.length > 0 && (
                    <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Not measured yet
                        </p>

                        <p className="mt-3 max-w-2xl text-xs leading-6 text-zinc-500">
                            These allowances are configured, but no
                            Studio flow writes their counter yet, so a
                            number here would be invented.
                        </p>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {
                                untracked.map(
                                    (entry) => (
                                        <div
                                            key={
                                                entry.feature
                                            }
                                            className="rounded-2xl border border-white/[0.06] bg-[#0c0c11] p-4"
                                        >
                                            <p className="text-sm font-medium text-zinc-300">
                                                {
                                                    entry.label
                                                }
                                            </p>

                                            <p className="mt-1 text-xs text-zinc-600">
                                                Limit{" "}
                                                {
                                                    entry.limit
                                                }

                                                {" · "}
                                                {
                                                    RESET_LABELS[
                                                        entry.resetPeriod
                                                    ]
                                                }
                                            </p>
                                        </div>
                                    )
                                )
                            }
                        </div>
                    </section>
                )
            }

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Recorded consumption
                </p>

                {
                    ledger.length === 0 ? (
                        <p className="mt-4 text-sm text-zinc-500">
                            Nothing recorded yet.
                        </p>
                    ) : (
                        <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.06]">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-zinc-500">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">
                                            Feature
                                        </th>

                                        <th className="px-4 py-3 font-semibold">
                                            Period
                                        </th>

                                        <th className="px-4 py-3 font-semibold">
                                            Used
                                        </th>

                                        <th className="px-4 py-3 font-semibold">
                                            Last used
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-white/[0.05]">
                                    {
                                        ledger.map(
                                            (row) => (
                                                <tr
                                                    key={`${row.feature}-${row.periodKey}`}
                                                >
                                                    <td className="px-4 py-3 text-zinc-200">
                                                        {
                                                            isFeatureId(
                                                                row.feature
                                                            )
                                                                ? getFeatureConfig(
                                                                    row.feature
                                                                ).label
                                                                : row.feature
                                                        }
                                                    </td>

                                                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                                                        {
                                                            row.periodKey
                                                        }
                                                    </td>

                                                    <td className="px-4 py-3 text-zinc-300">
                                                        {
                                                            row.used
                                                        }
                                                    </td>

                                                    <td className="px-4 py-3 text-xs text-zinc-500">
                                                        {
                                                            formatDateTime(
                                                                row.lastUsedAt
                                                            )
                                                        }
                                                    </td>
                                                </tr>
                                            )
                                        )
                                    }
                                </tbody>
                            </table>
                        </div>
                    )
                }
            </section>
        </>
    );
}
