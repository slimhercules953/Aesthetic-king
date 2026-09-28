import {
    NextResponse,
} from "next/server";

import {
    getDiscordAuthorizeUrl,
} from "../../../../lib/auth";

export async function GET() {
    const state =
        crypto.randomUUID();

    const authorizeUrl =
        getDiscordAuthorizeUrl(
            state
        );

    const response =
        NextResponse.redirect(
            authorizeUrl
        );

    response.cookies.set(
        "discord_oauth_state",
        state,
        {
            httpOnly: true,

            sameSite: "lax",

            secure:
                process.env.NODE_ENV ===
                "production",

            maxAge: 60 * 10,

            path: "/",
        }
    );

    return response;
}