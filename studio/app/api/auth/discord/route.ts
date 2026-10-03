import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    createPkcePair,
    getDiscordAuthorizeUrl,
    OAUTH_STATE_COOKIE_NAME,
    OAUTH_VERIFIER_COOKIE_NAME,
    resolveAppOrigin,
    shouldUseSecureCookies,
} from "../../../../lib/auth";

/**
 * Both cookies live for the length of the redirect dance and nothing
 * longer. A stale verifier is worse than none, because it would be
 * replayed against a code the browser never requested.
 */
const OAUTH_COOKIE_MAX_AGE =
    60 * 10;

export async function GET(
    request: NextRequest
) {
    const state =
        crypto.randomUUID();

    const appUrl =
        resolveAppOrigin(
            request.url
        );

    const {
        codeVerifier,
        codeChallenge,
    } = await createPkcePair();

    const authorizeUrl =
        getDiscordAuthorizeUrl(
            state,
            appUrl,
            codeChallenge
        );

    const response =
        NextResponse.redirect(
            authorizeUrl
        );

    const cookieOptions = {
        httpOnly: true,

        sameSite: "lax" as const,

        secure:
            shouldUseSecureCookies(
                request.url
            ),

        maxAge: OAUTH_COOKIE_MAX_AGE,

        path: "/",
    };

    response.cookies.set(
        OAUTH_STATE_COOKIE_NAME,
        state,
        cookieOptions
    );

    response.cookies.set(
        OAUTH_VERIFIER_COOKIE_NAME,
        codeVerifier,
        cookieOptions
    );

    return response;
}
