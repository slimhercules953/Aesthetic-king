import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
} from "../../../../lib/session";

export async function GET(
    request: NextRequest
) {
    const response =
        NextResponse.redirect(
            new URL(
                "/",
                request.url
            )
        );

    response.cookies.set(
        SESSION_COOKIE_NAME,
        "",
        {
            httpOnly: true,

            secure:
                process.env.NODE_ENV ===
                "production",

            sameSite: "lax",

            expires:
                new Date(0),

            path: "/",
        }
    );

    return response;
}