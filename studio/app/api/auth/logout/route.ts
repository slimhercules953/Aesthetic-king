import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    shouldUseSecureCookies,
} from "../../../../lib/auth";

import {
    SESSION_COOKIE_NAME,
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
}