import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    constantTimeEquals,
    exchangeDiscordCode,
    getDiscordUser,
    OAUTH_STATE_COOKIE_NAME,
    OAUTH_VERIFIER_COOKIE_NAME,
    resolveAppOrigin,
    shouldUseSecureCookies,
} from "../../../../../lib/auth";

import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    upsertDiscordUser,
} from "../../../../../lib/users";

import {
    ensureGrandfatheredEntitlement,
} from "../../../../../lib/grandfather";

import {
    createSessionToken,
    SESSION_COOKIE_NAME,
    SESSION_DURATION_SECONDS,
} from "../../../../../lib/session";

import {
    saveDiscordOAuthCredentials,
} from "../../../../../lib/discordOAuth";

export async function GET(
    request: NextRequest
) {
    const url =
        new URL(
            request.url
        );

    const code =
        url.searchParams.get(
            "code"
        );

    const returnedState =
        url.searchParams.get(
            "state"
        );

    const storedState =
        request.cookies.get(
            OAUTH_STATE_COOKIE_NAME
        )?.value;

    const codeVerifier =
        request.cookies.get(
            OAUTH_VERIFIER_COOKIE_NAME
        )?.value;

    try {
        // Both nonces are ours, so a mismatch is a crossed or forged
        // callback rather than a user mistake. Clear the cookies
        // either way so a retry starts a clean flow.
        if (
            !code ||
            !returnedState ||
            !storedState ||
            !constantTimeEquals(
                returnedState,
                storedState
            )
        ) {
            return clearOAuthCookies(
                NextResponse.json(
                    {
                        error:
                            "Invalid Discord OAuth state.",
                    },
                    {
                        status: 400,
                    }
                )
            );
        }

        if (!codeVerifier) {
            return clearOAuthCookies(
                NextResponse.json(
                    {
                        error:
                            "The login session expired. Please sign in again.",
                    },
                    {
                        status: 400,
                    }
                )
            );
        }

        const token =
            await exchangeDiscordCode(
                code,
                resolveAppOrigin(
                    request.url
                ),
                codeVerifier
            );

        const discordUser =
            await getDiscordUser(
                token.access_token
            );

        await upsertDiscordUser({
            discordId:
                discordUser.id,

            username:
                discordUser.username,

            displayName:
                discordUser.global_name,

            avatarHash:
                discordUser.avatar,
        });

        await saveDiscordOAuthCredentials(
            discordUser.id,
            {
                accessToken:
                    token.access_token,

                refreshToken:
                    token.refresh_token,

                tokenType:
                    token.token_type,

                scope:
                    token.scope,

                expiresIn:
                    token.expires_in,
            }
        );

        await ensureGrandfatheredEntitlement(
            discordUser.id
        );

        const sessionToken =
            await createSessionToken({
                discordId:
                    discordUser.id,

                username:
                    discordUser.global_name ||
                    discordUser.username,

                avatarHash:
                    discordUser.avatar,
            });

        const response =
            NextResponse.redirect(
                new URL(
                    "/dashboard",
                    request.url
                )
            );

        response.cookies.set(
            SESSION_COOKIE_NAME,
            sessionToken,
            {
                httpOnly: true,

                secure:
                    shouldUseSecureCookies(
                        request.url
                    ),

                sameSite: "lax",

                maxAge:
                    SESSION_DURATION_SECONDS,

                path: "/",
            }
        );

        return clearOAuthCookies(
            response
        );
    } catch (error) {
        return handleRouteError(
            error,
            401,
            "We could not complete the Discord sign-in. Please try again."
        );
    }
}

function clearOAuthCookies(
    response: NextResponse
): NextResponse {
    response.cookies.delete(
        OAUTH_STATE_COOKIE_NAME
    );

    response.cookies.delete(
        OAUTH_VERIFIER_COOKIE_NAME
    );

    return response;
}
