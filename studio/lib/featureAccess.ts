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

/**
 * The single entry point for "may this user do this thing?".
 *
 * Pages, API routes and components should import ONLY this module
 * for entitlement decisions. Never read a plan or compare a limit at
 * the call site — the numbers live in `features.ts` and the rules
 * live here, so a policy change stays a one-file change.
 *
 * Crowns are intentionally not spent here. `crownUnlockAvailable`
 * and `crownCost` are informational until the Crown ledger lands in
 * Phase 5, at which point `allowed` will also consider active
 * unlocks.
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
     * null means unlimited.
     */
    limit: number | null;

    /**
     * null means unlimited.
     */
    remaining: number | null;

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

    const limit =
        getLimitForPlan(
            feature,
            plan
        );

    const resetPeriod: ResetPeriod =
        config.kind === "metered"
            ? config.resetPeriod
            : "never";

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

    return {
        feature,

        kind: config.kind,

        label: config.label,
        description:
            config.description,

        plan,

        allowed:
            config.kind === "gated"
                ? (limit ?? 0) > 0
                : usage.used <
                    (limit ?? 0),

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

        periodKey:
            getPeriodKey(
                resetPeriod
            ),
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
