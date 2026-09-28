const DISCORD_API_BASE =
    "https://discord.com/api/v10";

export type DiscordUser = {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
};

export function getDiscordAuthorizeUrl(
    state: string
) {
    const clientId =
        process.env.DISCORD_CLIENT_ID;

    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId) {
        throw new Error(
            "DISCORD_CLIENT_ID is not configured."
        );
    }

    if (!appUrl) {
        throw new Error(
            "NEXT_PUBLIC_APP_URL is not configured."
        );
    }

    const redirectUri =
        `${appUrl}/api/auth/discord/callback`;

    const params =
        new URLSearchParams({
            client_id:
                clientId,

            response_type:
                "code",

            redirect_uri:
                redirectUri,

            scope:
                "identify",

            state,
        });

    return (
        "https://discord.com/oauth2/authorize?" +
        params.toString()
    );
}

export async function exchangeDiscordCode(
    code: string
) {
    const clientId =
        process.env.DISCORD_CLIENT_ID;

    const clientSecret =
        process.env.DISCORD_CLIENT_SECRET;

    const appUrl =
        process.env.NEXT_PUBLIC_APP_URL;

    if (
        !clientId ||
        !clientSecret ||
        !appUrl
    ) {
        throw new Error(
            "Discord OAuth configuration is incomplete."
        );
    }

    const redirectUri =
        `${appUrl}/api/auth/discord/callback`;

    const body =
        new URLSearchParams({
            client_id:
                clientId,

            client_secret:
                clientSecret,

            grant_type:
                "authorization_code",

            code,

            redirect_uri:
                redirectUri,
        });

    const response =
        await fetch(
            `${DISCORD_API_BASE}/oauth2/token`,
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded",
                },

                body,
            }
        );

    if (!response.ok) {
        throw new Error(
            `Discord token exchange failed: ${response.status} ${response.statusText}`
        );
    }

    return response.json() as Promise<{
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
    }>;
}

export async function getDiscordUser(
    accessToken: string
): Promise<DiscordUser> {
    const response =
        await fetch(
            `${DISCORD_API_BASE}/users/@me`,
            {
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`,
                },
            }
        );

    if (!response.ok) {
        throw new Error(
            `Discord user request failed: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}