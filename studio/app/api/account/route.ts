import {
    cookies,
} from "next/headers";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    handleRouteError,
} from "../../../lib/apiError";

import {
    deleteAccount,
} from "../../../lib/account";

import {
    shouldUseSecureCookies,
} from "../../../lib/auth";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

/**
 * Deletes the signed-in user's Studio account.
 *
 * There is deliberately no confirmation token here: the session cookie
 * is the proof of identity, and the typed username confirmation lives
 * in the UI. What matters is that this route only ever acts on the
 * session it was given — the body is never read, so a caller cannot
 * name some other account to delete.
 */
export async function DELETE(
    request: NextRequest
) {
    try {
        const cookieStore =
            await cookies();

        const cookie =
            cookieStore.get(
                SESSION_COOKIE_NAME
            );

        const session = cookie
            ? await verifySessionToken(
                cookie.value
            )
            : null;

        if (!session) {
            return NextResponse.json(
                {
                    error:
                        "You need to sign in to do that.",
                },
                {
                    status: 401,
                }
            );
        }

        await deleteAccount(
            session.discordId
        );

        /*
         * The cookie is cleared even when nothing was deleted, so a
         * session pointing at an already-removed account cannot linger
         * and render a dashboard with no owner.
         */
        const response =
            NextResponse.json({
                success: true,
            });

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

        return response;
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not delete your account."
        );
    }
}
