"use client";

/**
 * Client-side mirror of the denial body built in `lib/gate.ts`.
 *
 * A refusal from the server is never just a string. When it carries a
 * feature code we can offer the two honest exits: upgrade, or spend
 * Crowns if that feature supports it.
 */

export type FeatureDeniedBody = {
    error: string;

    code: "FEATURE_LIMIT_REACHED" | "FEATURE_LOCKED";

    feature: string;
    label: string;

    plan: "free" | "premium";

    used: number;
    limit: number | null;
    remaining: number | null;

    tracked: boolean;

    crownUnlockAvailable: boolean;
    crownCost: number | null;

    upgradeHref: string;
    crownsHref: string;
};

/**
 * Returns the denial body when the response was a limit refusal, or
 * null for any other failure so the caller keeps its normal error
 * handling.
 */
export function readDeniedBody(
    status: number,
    payload: unknown
): FeatureDeniedBody | null {
    if (
        status !== 403 &&
        status !== 429
    ) {
        return null;
    }

    if (
        typeof payload !==
        "object" ||
        payload === null
    ) {
        return null;
    }

    const body =
        payload as Partial<
            FeatureDeniedBody
        >;

    if (
        body.code !==
            "FEATURE_LIMIT_REACHED" &&
        body.code !== "FEATURE_LOCKED"
    ) {
        return null;
    }

    if (
        typeof body.error !==
        "string"
    ) {
        return null;
    }

    return {
        error: body.error,
        code: body.code,

        feature:
            body.feature ??
            "UNKNOWN",

        label:
            body.label ??
            "This feature",

        plan:
            body.plan === "premium"
                ? "premium"
                : "free",

        used:
            body.used ?? 0,
        limit:
            body.limit ??
            null,
        remaining:
            body.remaining ??
            null,

        tracked:
            body.tracked ??
            false,

        crownUnlockAvailable:
            body.crownUnlockAvailable ??
            false,

        crownCost:
            body.crownCost ??
            null,

        upgradeHref:
            body.upgradeHref ??
            "/dashboard/premium",

        crownsHref:
            body.crownsHref ??
            "/dashboard/premium/crowns",
    };
}
