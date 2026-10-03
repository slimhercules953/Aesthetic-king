import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    handleRouteError,
} from "../../../lib/apiError";

import {
    getFeatureAccessMany,
} from "../../../lib/featureAccess";

import {
    getAssetSetById,
    isPremiumSet,
} from "../../../lib/assetCatalog";

import {
    canCreateMoreProfiles,
    countProfilesForDiscordUser,
    createProfileForDiscordUser,
    getProfilesByDiscordId,
} from "../../../lib/profiles";

import {
    FREE_PROFILE_VERSIONS,
    parseProfileInput,
} from "../../../lib/profileModel";

async function getSession(
    request: NextRequest
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return null;
    }

    return verifySessionToken(
        cookie.value
    );
}

export async function GET(
    request: NextRequest
) {
    const session =
        await getSession(
            request
        );

    if (!session) {
        return NextResponse.json(
            {
                error:
                    "Unauthorized",
            },
            {
                status: 401,
            }
        );
    }

    try {
        const profiles =
            await getProfilesByDiscordId(
                session.discordId
            );

        return NextResponse.json({
            profiles,
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load profiles."
        );
    }
}

export async function POST(
    request: NextRequest
) {
    const session =
        await getSession(
            request
        );

    if (!session) {
        return NextResponse.json(
            {
                error:
                    "Unauthorized",
            },
            {
                status: 401,
            }
        );
    }

    try {
        const body =
            await request
                .json()
                .catch(() => null);

        const parsed = parseProfileInput(
            body
        );

        if (!parsed.ok) {
            return NextResponse.json(
                {
                    error:
                        parsed.errors[0],
                },
                {
                    status: 400,
                }
            );
        }

        /*
         * One access lookup for both gates. `allowed` is used rather than
         * `plan === "PREMIUM"` because PREMIUM_ASSETS is Crown-unlockable:
         * a holder who bought a 30-day unlock has earned the set, and
         * refusing them because their plan row still says FREE would be
         * wrong in a way that only shows up after a purchase.
         */
        const [
            existingCount,
            access,
        ] = await Promise.all([
            countProfilesForDiscordUser(
                session.discordId
            ),

            getFeatureAccessMany(
                session.discordId,
                [
                    "ADVANCED_PROFILE_BUILDER",
                    "PREMIUM_ASSETS",
                ]
            ),
        ]);

        const advanced =
            access.ADVANCED_PROFILE_BUILDER;

        /*
         * "Saved versions" is what ADVANCED_PROFILE_BUILDER sells, so the
         * free tier gets the Builder but keeps exactly one profile. The
         * count is read here rather than trusted from the client, and the
         * body matches the shape `gate.ts` returns so the client renders
         * the same upsell it uses everywhere else.
         */
        if (
            !canCreateMoreProfiles(
                existingCount,
                advanced.allowed
            )
        ) {
            return NextResponse.json(
                {
                    error:
                        `Free plans keep ${FREE_PROFILE_VERSIONS} profile. Advanced Profile Builder adds saved versions.`,

                    code:
                        "FEATURE_LOCKED",

                    feature:
                        "ADVANCED_PROFILE_BUILDER",

                    label:
                        advanced.label,

                    plan:
                        advanced.plan,

                    limit:
                        FREE_PROFILE_VERSIONS,

                    used:
                        existingCount,

                    remaining: 0,

                    crownUnlockAvailable:
                        advanced.crownUnlockAvailable,

                    crownCost:
                        advanced.crownCost,

                    upgradeHref:
                        "/dashboard/premium",

                    crownsHref:
                        "/dashboard/premium/crowns",
                },
                {
                    status: 403,
                }
            );
        }

        /*
         * A profile set is a reference, not a copy: only the id is stored
         * and the images are resolved from the catalog at render time.
         * That stays safe only if a free user cannot name a set they have
         * not unlocked, so the id is checked against the catalog rather
         * than against whatever the Builder happened to display.
         */
        const setId =
            parsed.value.profileSetId;

        if (setId) {
            if (!getAssetSetById(setId)) {
                return NextResponse.json(
                    {
                        error:
                            "That profile set no longer exists.",
                    },
                    {
                        status: 400,
                    }
                );
            }

            if (
                isPremiumSet(setId) &&
                !access.PREMIUM_ASSETS.allowed
            ) {
                return NextResponse.json(
                    {
                        error:
                            "That profile set is a Premium asset.",

                        code:
                            "FEATURE_LOCKED",

                        feature:
                            "PREMIUM_ASSETS",

                        label:
                            access.PREMIUM_ASSETS
                                .label,

                        plan:
                            access.PREMIUM_ASSETS
                                .plan,

                        crownUnlockAvailable:
                            access.PREMIUM_ASSETS
                                .crownUnlockAvailable,

                        crownCost:
                            access.PREMIUM_ASSETS
                                .crownCost,

                        upgradeHref:
                            "/dashboard/premium",

                        crownsHref:
                            "/dashboard/premium/crowns",
                    },
                    {
                        status: 403,
                    }
                );
            }
        }

        const profile =
            await createProfileForDiscordUser(
                session.discordId,
                parsed.value
            );

        return NextResponse.json({
            profile,
        });
    } catch (error) {
        /*
         * 500, not 400. Every validation failure in this handler answers
         * with its own 400 before reaching here, so anything caught is an
         * unexpected failure — a database that would not answer, most
         * likely. Reporting that as a bad request tells the user their
         * own input is at fault and teaches the Builder to treat a
         * transient outage as a permanent one.
         */
        return handleRouteError(
            error,
            500,
            "Could not create profile."
        );
    }
}
