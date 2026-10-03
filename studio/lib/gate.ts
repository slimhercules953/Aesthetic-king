import {
    NextResponse,
} from "next/server";

import {
    getFeatureAccess,
    type FeatureAccess,
} from "./featureAccess";

import type {
    FeatureId,
} from "./features";

/**
 * Server-side enforcement for every gated route.
 *
 * Hiding a button is not a limit. Each protected endpoint calls
 * `requireFeature` and refuses the request itself, so the rules hold
 * for anyone who posts to the URL directly.
 *
 * A denial is not a bare "Premium required". The body carries the
 * plan, the numbers, and whether Crowns can unlock the action, so the
 * client can render [Explore Premium] alongside [Use N Crowns].
 */

export type FeatureDeniedBody = {
    error: string;

    code: "FEATURE_LIMIT_REACHED" | "FEATURE_LOCKED";

    feature: FeatureId;
    label: string;

    plan: FeatureAccess["plan"];

    used: number;
    limit: number | null;
    remaining: number | null;

    tracked: boolean;

    crownUnlockAvailable: boolean;
    crownCost: number | null;

    upgradeHref: string;
    crownsHref: string;
};

export function buildDeniedBody(
    access: FeatureAccess
): FeatureDeniedBody {
    const locked =
        access.kind === "gated";

    return {
        error: locked
            ? `${access.label} is a Premium feature.`
            : `You have used all ${access.limit} ${access.label.toLowerCase()} in this period.`,

        code: locked
            ? "FEATURE_LOCKED"
            : "FEATURE_LIMIT_REACHED",

        feature: access.feature,
        label: access.label,

        plan: access.plan,

        used: access.used,
        limit: access.limit,
        remaining: access.remaining,

        tracked: access.tracked,

        crownUnlockAvailable:
            access.crownUnlockAvailable,

        crownCost: access.crownCost,

        upgradeHref:
            "/dashboard/premium",

        crownsHref:
            "/dashboard/premium/crowns",
    };
}

export function deniedResponse(
    access: FeatureAccess
): NextResponse {
    return NextResponse.json(
        buildDeniedBody(access),
        {
            status:
                access.kind === "gated"
                    ? 403
                    : 429,
        }
    );
}

/**
 * Returns the access record when the action may run, or a ready to
 * return response when it may not.
 */
export async function requireFeature(
    discordId: string,
    feature: FeatureId
): Promise<
    | {
        allowed: true;
        access: FeatureAccess;
        response?: undefined;
    }
    | {
        allowed: false;
        access: FeatureAccess;
        response: NextResponse;
    }
> {
    const access =
        await getFeatureAccess(
            discordId,
            feature
        );

    if (access.allowed) {
        return {
            allowed: true as const,
            access,
        };
    }

    return {
        allowed: false as const,
        access,
        response:
            deniedResponse(
                access
            ),
    };
}
