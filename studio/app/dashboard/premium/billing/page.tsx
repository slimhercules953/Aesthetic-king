import {
    cookies,
} from "next/headers";

import {
    ArrowLeft,
    Check,
    Crown,
    Minus,
    ShieldCheck,
    SlidersHorizontal,
} from "lucide-react";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    getAllEntitlements,
    getEntitlementSummary,
} from "../../../../lib/entitlements";

import {
    billingDevToolsEnabled,
} from "../../../../lib/devTools";

import {
    FEATURE_IDS,
    FEATURES,
    getLimitForPlan,
    type Plan,
} from "../../../../lib/features";

function formatDate(
    value: Date | null
): string {
    if (!value) {
        return "No end date";
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

function formatDateTime(
    value: Date
): string {
    return value.toLocaleString(
        "en-US",
        {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        }
    );
}

/**
 * Renders a plan's allowance for one feature.
 *
 * "Unlimited" is never claimed — every Premium number in the
 * registry is a finite placeholder, and the copy must match.
 */
function planValue(
    feature:
        (typeof FEATURE_IDS)[number],
    plan: Plan
): {
    text: string;
    enabled: boolean;
} {
    const config =
        FEATURES[feature];

    if (config.kind === "gated") {
        const allowed = getLimitForPlan(
            feature,
            plan
        );

        return {
            text:
                (allowed ?? 0) > 0
                    ? "Included"
                    : config.crownCost
                        ? `${config.crownCost} Crowns`
                        : "Not included",

            enabled:
                (allowed ?? 0) > 0,
        };
    }

    const limit = getLimitForPlan(
        feature,
        plan
    );

    return {
        text:
            limit === null
                ? "No cap"
                : String(limit),

        enabled:
            limit === null ||
            limit > 0,
    };
}

export default async function PremiumBillingPage() {
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

    const [summary, history] =
        await Promise.all([
            getEntitlementSummary(
                identity.discordId
            ),

            getAllEntitlements(
                identity.discordId
            ),
        ]);

    const isPremium =
        summary.plan === "PREMIUM";

    const devEnabled =
        billingDevToolsEnabled(
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
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
                    Billing
                </p>

                <h1 className="mt-3 text-3xl font-bold tracking-tight">
                    {
                        isPremium
                            ? "Premium active"
                            : "Premium is not active"
                    }
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                    {
                        isPremium
                            ? `This account is Premium${
                                summary.premium?.source
                                    ? ` through “${summary.premium.source}”`
                                    : ""
                            }, listed through ${formatDate(
                                summary.premium?.endsAt ?? null
                            )}.`
                            : "Access is determined by the entitlement records below, not by anything stored in your session."
                    }
                </p>
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-zinc-400">
                        <ShieldCheck
                            size={17}
                        />
                    </div>

                    <div>
                        <h2 className="text-sm font-semibold text-zinc-100">
                            Checkout is not connected yet
                        </h2>

                        <p className="mt-2 max-w-3xl text-xs leading-6 text-zinc-500">
                            No payment provider is wired up, and this
                            page deliberately does not imitate one.
                            Premium is granted today by a provider
                            webhook, a Discord SKU, or a manual grant.
                            The entitlement system is built to work
                            before billing exists, so connecting a
                            provider later only adds rows here rather
                            than becoming the source of truth.
                        </p>
                    </div>
                </div>
            </section>

            {
                devEnabled && (
                    <section className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/[0.04] p-6">
                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                            <SlidersHorizontal
                                size={15}
                            />

                            Entitlement testing
                        </div>

                        <p className="mt-2 text-xs leading-6 text-amber-200/70">
                            Visible only when the deployment sets{" "}
                            <code>BILLING_DEV=&quot;true&quot;</code>{" "}
                            and your Discord ID is listed in{" "}
                            <code>DEV_BILLING_DISCORD_IDS</code>.
                            Grants supersede any live Premium row
                            rather than stacking, and revoking marks
                            the record inactive instead of deleting it.
                        </p>

                        <div className="mt-4 flex flex-wrap gap-3">
                            <form
                                action="/api/billing/dev-entitlement"
                                method="post"
                                className="flex items-center gap-2"
                            >
                                <input
                                    type="hidden"
                                    name="action"
                                    value="grant"
                                />

                                <select
                                    name="months"
                                    className="rounded-xl border border-white/[0.08] bg-[#0c0c11] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500/40"
                                >
                                    <option value="1">
                                        1 month
                                    </option>

                                    <option value="3">
                                        3 months
                                    </option>

                                    <option value="12">
                                        12 months
                                    </option>
                                </select>

                                <button
                                    type="submit"
                                    className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
                                >
                                    Grant Premium
                                </button>
                            </form>

                            <form
                                action="/api/billing/dev-entitlement"
                                method="post"
                            >
                                <input
                                    type="hidden"
                                    name="action"
                                    value="revoke"
                                />

                                <button
                                    type="submit"
                                    className="rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.07]"
                                >
                                    Revoke Premium
                                </button>
                            </form>
                        </div>
                    </section>
                )
            }

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Free and Premium
                </p>

                <h2 className="mt-2 text-lg font-semibold text-zinc-100">
                    What changes
                </h2>

                <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="text-xs uppercase tracking-wider text-zinc-500">
                            <tr>
                                <th className="py-3 pr-4 font-semibold">
                                    Feature
                                </th>

                                <th className="px-4 py-3 font-semibold">
                                    Free
                                </th>

                                <th className="px-4 py-3 font-semibold text-violet-300">
                                    Premium
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-white/[0.05]">
                            {
                                FEATURE_IDS.map(
                                    (feature) => {
                                        const free =
                                            planValue(
                                                feature,
                                                "FREE"
                                            );

                                        const premium =
                                            planValue(
                                                feature,
                                                "PREMIUM"
                                            );

                                        return (
                                            <tr
                                                key={
                                                    feature
                                                }
                                            >
                                                <td className="py-3 pr-4">
                                                    <p className="text-zinc-200">
                                                        {
                                                            FEATURES[
                                                                feature
                                                            ].label
                                                        }
                                                    </p>

                                                    <p className="mt-0.5 text-xs text-zinc-600">
                                                        {
                                                            FEATURES[
                                                                feature
                                                            ].description
                                                        }
                                                    </p>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={
                                                            "inline-flex items-center gap-1.5 " +
                                                            (
                                                                free.enabled
                                                                    ? "text-zinc-300"
                                                                    : "text-zinc-600"
                                                            )
                                                        }
                                                    >
                                                        {
                                                            free.enabled ? (
                                                                <Check
                                                                    size={13}
                                                                    className="text-emerald-400"
                                                                />
                                                            ) : (
                                                                <Minus
                                                                    size={13}
                                                                />
                                                            )
                                                        }

                                                        {
                                                            free.text
                                                        }
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={
                                                            "inline-flex items-center gap-1.5 font-medium " +
                                                            (
                                                                premium.enabled
                                                                    ? "text-zinc-100"
                                                                    : "text-zinc-600"
                                                            )
                                                        }
                                                    >
                                                        {
                                                            premium.enabled ? (
                                                                <Check
                                                                    size={13}
                                                                    className="text-violet-400"
                                                                />
                                                            ) : (
                                                                <Crown
                                                                    size={13}
                                                                    className="text-amber-400"
                                                                />
                                                            )
                                                        }

                                                        {
                                                            premium.text
                                                        }
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    }
                                )
                            }
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 lg:p-7">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Entitlement records
                </p>

                {
                    history.length === 0 ? (
                        <p className="mt-4 text-sm text-zinc-500">
                            No entitlements have ever been recorded on
                            this account.
                        </p>
                    ) : (
                        <ul className="mt-5 divide-y divide-white/[0.05]">
                            {
                                history.map(
                                    (row) => (
                                        <li
                                            key={
                                                row.id
                                            }
                                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm text-zinc-200">
                                                    {
                                                        row.type
                                                    }
                                                </p>

                                                <p className="mt-1 text-xs text-zinc-600">
                                                    {
                                                        row.source ??
                                                        "unknown source"
                                                    }

                                                    {" · granted "}
                                                    {
                                                        formatDateTime(
                                                            row.createdAt
                                                        )
                                                    }
                                                </p>

                                                <p className="mt-1 text-xs text-zinc-600">
                                                    {
                                                        row.skuId
                                                            ? `Store SKU ${row.skuId}`
                                                            : "Not from a store purchase"
                                                    }
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-zinc-500">
                                                    {
                                                        formatDate(
                                                            row.endsAt
                                                        )
                                                    }
                                                </span>

                                                {
                                                    row.active ? (
                                                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                                            Ended
                                                        </span>
                                                    )
                                                }
                                            </div>
                                        </li>
                                    )
                                )
                            }
                        </ul>
                    )
                }
            </section>
        </>
    );
}
