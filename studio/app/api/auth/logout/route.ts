import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    shouldUseSecureCookies,
} from "../../../../lib/auth";

import {
    SESSION_COOKIE_NAME,
    revokeSessions,
    verifySessionToken,
} from "../../../../lib/session";

export async function POST(
    request: NextRequest
) {
    const response =
        NextResponse.redirect(
            new URL(
                "/",
                request.url
            ),
            {
                status: 303,
            }
        );

    /*
     * Clear the cookie first, so the browser is clean no matter what the
     * database does next.
     */
    response.cookies.set(
        SESSION_COOKIE_NAME,
        "",
        {
            httpOnly: true,
            secure:
                shouldUseSecureCookies(
                    request.url
                ),
            sameSite: "lax",
            expires:
                new Date(0),
            path: "/",
        }
    );

    /*
     * Then revoke server-side. Deleting the cookie alone only forgets the
     * token; it does not invalidate it, so a copy taken earlier — from
     * browser storage, a proxy log, or a shared machine — would keep
     * working for the rest of the token's 7-day life.
     *
     * Revocation is keyed on the identity inside the verified token, so a
     * caller presenting a forged or absent cookie cannot bump anybody's
     * epoch. An unverified cookie is simply ignored.
     */
    const sessionCookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (sessionCookie?.value) {
        const session =
            await verifySessionToken(
                sessionCookie.value
            );

        if (session) {
            await revokeSessions(
                session.discordId
            );
        }
    }

    return response;
}

/*
 * Sign out is a state change, so POST is the correct verb and every button in
 * the app uses it. Accepting GET as well costs nothing and turns a stale link
 * (or a bookmark) into a real sign-out instead of a 405.
 */
export const GET = POST;
