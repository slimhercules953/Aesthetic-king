import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    exchangeDiscordCode,
    getDiscordUser,
} from "../../../../../lib/auth";

import {
    upsertDiscordUser,
} from "../../../../../lib/users";

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
            "discord_oauth_state"
        )?.value;

    if (
        !code ||
        !returnedState ||
        !storedState ||
        returnedState !==
        storedState
    ) {
        return NextResponse.json(
            {
                error:
                    "Invalid Discord OAuth state.",
            },
            {
                status: 400,
            }
        );
    }

    const token =
        await exchangeDiscordCode(
            code
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
                process.env.NODE_ENV ===
                "production",

            sameSite: "lax",

            maxAge:
                SESSION_DURATION_SECONDS,

            path: "/",
        }
    );

    response.cookies.delete(
        "discord_oauth_state"
    );

    return response;
}