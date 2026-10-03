import {
    getActivePlan,
} from "./entitlements";

import {
    getFeatureConfig,
    getLimitForPlan,
    getPeriodEnd,
    getPeriodKey,
    type FeatureId,
    type Plan,
    type ResetPeriod,
} from "./features";

import {
    peekUsage,
} from "./usage";

import {
    getActiveUnlocks,
} from "./unlocks";

/**
 * The single entry point for "may this user do this thing?".
 *
 * Pages, API routes and components should import ONLY this module
 * for entitlement decisions. Never read a plan or compare a limit at
 * the call site — the numbers live in `features.ts` and the rules
 * live here, so a policy change stays a one-file change.
 *
 * Crowns are not spent here. A Crown purchase is its own action
 * (`unlocks.ts`); this module only reports whether an already-purchased
 * unlock currently applies, which is what makes `allowed` true.
 */

export type FeatureAccess = {
    feature: FeatureId;

    kind: "metered" | "gated";

    label: string;
    description: string;

    plan: Plan;

    /**
     * Whether the action may run right now.
     */
    allowed: boolean;

    /**
     * Consumption in the current window. Only meaningful when
     * `tracked` is true.
     */
    used: number;

    /**
     * null means unlimited. Includes any Crown boost bought for the
     * current window, so the number shown is the number enforced.
     */
    limit: number | null;

    /**
     * null means unlimited.
     */
    remaining: number | null;

    /**
     * Extra allowance bought with Crowns for the current window.
     * Already included in `limit`; reported separately so the UI can
     * say "10 plan + 10 Crowns".
     */
    crownBoost: number;

    /**
     * When a Crown purchase of a gated feature lapses, or null when
     * the user has no such unlock.
     */
    crownUnlockExpiresAt: Date | null;

    /**
     * True when access currently depends on a Crown purchase, i.e.
     * the plan alone would not have allowed it.
     */
    unlockedWithCrowns: boolean;

    /**
     * False while nothing records this feature yet, so the UI can
     * hide the counter instead of lying with "0 of N".
     */
    tracked: boolean;

    crownUnlockAvailable: boolean;
    crownCost: number | null;

    resetPeriod: ResetPeriod;

    /**
     * When the allowance refreshes, or null for lifetime features.
     */
    resetAt: Date | null;

    /**
     * Identifier of the current window, for logging now and for
     * FeatureUsage rows later.
     */
    periodKey: string;
};

async function resolveAccess(
    discordId: string,
    feature: FeatureId,
    plan: Plan
): Promise<FeatureAccess> {
    const config =
        getFeatureConfig(
            feature
        );

    const planLimit =
        getLimitForPlan(
            feature,
            plan
        );

    const resetPeriod: ResetPeriod =
        config.kind === "metered"
            ? config.resetPeriod
            : "never";

    const periodKey =
        getPeriodKey(
            resetPeriod
        );

    const unlocks =
        await getActiveUnlocks(
            discordId,
            feature,
            periodKey
        );

    /*
     * A boost raises the ceiling for this window; a timed unlock
     * opens a gated feature that the plan leaves shut. Both are
     * folded into `limit` here so that every caller — routes, meters
     * and the usage page — enforces and displays the same number
     * without knowing unlocks exist.
     */
    const limit =
        config.kind === "metered"
            ? planLimit === null
                ? null
                : planLimit + unlocks.boost
            : (planLimit ?? 0) > 0 ||
                unlocks.expiresAt !== null
                ? 1
                : planLimit;

    const usage =
        config.kind === "metered"
            ? await peekUsage(
                discordId,
                feature,
                {
                    usageSource:
                        config.usageSource,

                    resetPeriod:
                        config.resetPeriod,
                }
            )
            : {
                feature,
                used: 0,
                tracked: false,
            };

    const allowed =
        config.kind === "gated"
            ? (limit ?? 0) > 0
            : usage.used <
                (limit ?? 0);

    return {
        feature,

        kind: config.kind,

        label: config.label,
        description:
            config.description,

        plan,

        allowed,

        used: usage.used,

        limit,

        remaining:
            limit === null
                ? null
                : Math.max(
                    0,
                    limit -
                        usage.used
                ),

        crownBoost:
            unlocks.boost,

        crownUnlockExpiresAt:
            unlocks.expiresAt,

        unlockedWithCrowns:
            config.kind === "metered"
                ? unlocks.boost > 0
                : (planLimit ?? 0) <= 0 &&
                    unlocks.expiresAt !== null,

        tracked: usage.tracked,

        crownUnlockAvailable:
            config.crownUnlockAvailable,

        crownCost:
            config.crownCost,

        resetPeriod,

        resetAt:
            getPeriodEnd(
                resetPeriod
            ),

        periodKey,
    };
}

export async function getFeatureAccess(
    discordId: string,
    feature: FeatureId
): Promise<FeatureAccess> {
    const plan =
        await getActivePlan(
            discordId
        );

    return resolveAccess(
        discordId,
        feature,
        plan
    );
}

/**
 * Batch version for pages that render many gated cards at once.
 * The plan is resolved once instead of once per feature.
 */
export async function getFeatureAccessMany(
    discordId: string,
    features: FeatureId[]
): Promise<
    Record<
        FeatureId,
        FeatureAccess
    >
> {
    const plan =
        await getActivePlan(
            discordId
        );

    const entries =
        await Promise.all(
            features.map(
                async (
                    feature
                ) => [
                    feature,

                    await resolveAccess(
                        discordId,
                        feature,
                        plan
                    ),
                ] as const
            )
        );

    return Object.fromEntries(
        entries
    ) as Record<
        FeatureId,
        FeatureAccess
    >;
}
