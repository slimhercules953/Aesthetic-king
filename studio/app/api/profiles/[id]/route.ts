import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    handleRouteError,
} from "../../../../lib/apiError";

import {
    getFeatureAccessMany,
} from "../../../../lib/featureAccess";

import {
    getAssetSetById,
    isPremiumSet,
} from "../../../../lib/assetCatalog";

import {
    deleteProfileForDiscordUser,
    getProfileByIdForDiscordUser,
    setActiveProfileForDiscordUser,
    updateProfileForDiscordUser,
} from "../../../../lib/profiles";

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

function unauthorized() {
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

function notFound() {
    return NextResponse.json(
        {
            error:
                "Profile not found.",
        },
        {
            status: 404,
        }
    );
}

export async function GET(
    request: NextRequest,
    context: {
        params: Promise<{ id: string }>;
    }
) {
    const session =
        await getSession(
            request
        );

    if (!session) {
        return unauthorized();
    }

    const { id } =
        await context.params;

    try {
        const profile =
            await getProfileByIdForDiscordUser(
                id,
                session.discordId
            );

        if (!profile) {
            return notFound();
        }

        return NextResponse.json({
            profile,
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load profile."
        );
    }
}

export async function PATCH(
    request: NextRequest,
    context: {
        params: Promise<{ id: string }>;
    }
) {
    const session =
        await getSession(
            request
        );

    if (!session) {
        return unauthorized();
    }

    const { id } =
        await context.params;

    try {
        const body =
            await request
                .json()
                .catch(() => null);

        if (
            body === null ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return NextResponse.json(
                {
                    error:
                        "Expected a profile object.",
                },
                {
                    status: 400,
                }
            );
        }

        const patch =
            body as Record<
                string,
                unknown
            >;

        /*
         * The same gates as create. A PATCH is the more dangerous of the
         * two: a free user who already owns a profile could otherwise
         * edit their way into a premium set they were never offered.
         */
        if (
            patch.profileSetId !== undefined &&
            typeof patch.profileSetId ===
                "string" &&
            patch.profileSetId.trim()
        ) {
            const setId =
                patch.profileSetId.trim();

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

            if (isPremiumSet(setId)) {
                const premiumAssets =
                    await getFeatureAccessMany(
                        session.discordId,
                        ["PREMIUM_ASSETS"]
                    );

                if (
                    !premiumAssets.PREMIUM_ASSETS
                        .allowed
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
                                premiumAssets
                                    .PREMIUM_ASSETS
                                    .label,

                            plan:
                                premiumAssets
                                    .PREMIUM_ASSETS
                                    .plan,

                            crownUnlockAvailable:
                                premiumAssets
                                    .PREMIUM_ASSETS
                                    .crownUnlockAvailable,

                            crownCost:
                                premiumAssets
                                    .PREMIUM_ASSETS
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
        }

        /*
         * "Make active" goes through its own statement pair rather than
         * the generic patch: setting the flag on one row is meaningless
         * unless it is cleared on the others, and doing both in one
         * transaction is what keeps two profiles from claiming to be
         * active at once.
         */
        const wantsActive =
            typeof patch.isActive === "boolean" &&
            patch.isActive;

        const profile =
            await updateProfileForDiscordUser(
                id,
                session.discordId,
                {
                    name:
                        patch.name as
                            string | undefined,

                    profileSetId:
                        patch.profileSetId as
                            | string
                            | null
                            | undefined,

                    username:
                        patch.username as
                            string | undefined,

                    discriminator:
                        patch.discriminator as
                            string | undefined,

                    pronouns:
                        patch.pronouns as
                            string | undefined,

                    bio:
                        patch.bio as
                            string | undefined,

                    status:
                        patch.status as
                            string | undefined,

                    symbols:
                        patch.symbols as
                            string[] | undefined,

                    palette:
                        patch.palette as
                            string[] | undefined,

                    accentColor:
                        patch.accentColor as
                            | string
                            | null
                            | undefined,
                }
            );

        if (!profile) {
            return notFound();
        }

        const result = wantsActive
            ? await setActiveProfileForDiscordUser(
                id,
                session.discordId
            )
            : profile;

        return NextResponse.json({
            profile: result ?? profile,
        });
    } catch (error) {
        /*
         * 500, not 400 — see the note on the same choice in the create
         * handler. A PATCH that reaches the catch-all was not rejected
         * for being malformed; it failed on the way to the database.
         */
        return handleRouteError(
            error,
            500,
            "Could not update profile."
        );
    }
}

export async function DELETE(
    request: NextRequest,
    context: {
        params: Promise<{ id: string }>;
    }
) {
    const session =
        await getSession(
            request
        );

    if (!session) {
        return unauthorized();
    }

    const { id } =
        await context.params;

    try {
        const deleted =
            await deleteProfileForDiscordUser(
                id,
                session.discordId
            );

        if (!deleted) {
            return notFound();
        }

        return NextResponse.json({
            deleted: true,
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not delete profile."
        );
    }
}
