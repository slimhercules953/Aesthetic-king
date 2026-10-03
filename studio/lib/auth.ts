const DISCORD_API_BASE =
    "https://discord.com/api/v10";

export type DiscordUser = {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
};

export type DiscordGuild = {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
    approximate_member_count?: number;
    approximate_presence_count?: number;
};

export type DiscordOAuthTokenResponse = {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
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
                "identify guilds",

            state,
        });

    return (
        "https://discord.com/oauth2/authorize?" +
        params.toString()
    );
}

export async function exchangeDiscordCode(
    code: string
): Promise<DiscordOAuthTokenResponse> {
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
        const text =
            await response.text();

        throw new Error(
            `Discord token exchange failed: ${response.status} ${response.statusText} - ${text}`
        );
    }

    return response.json();
}

export async function refreshDiscordAccessToken(
    refreshToken: string
): Promise<DiscordOAuthTokenResponse> {
    const clientId =
        process.env.DISCORD_CLIENT_ID;

    const clientSecret =
        process.env.DISCORD_CLIENT_SECRET;

    if (
        !clientId ||
        !clientSecret
    ) {
        throw new Error(
            "Discord OAuth configuration is incomplete."
        );
    }

    const body =
        new URLSearchParams({
            client_id:
                clientId,

            client_secret:
                clientSecret,

            grant_type:
                "refresh_token",

            refresh_token:
                refreshToken,
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
        const text =
            await response.text();

        throw new Error(
            `Discord token refresh failed: ${response.status} ${response.statusText} - ${text}`
        );
    }

    return response.json();
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
        const text =
            await response.text();

        throw new Error(
            `Discord user request failed: ${response.status} ${response.statusText} - ${text}`
        );
    }

    return response.json();
}

export async function getDiscordGuilds(
    accessToken: string
): Promise<DiscordGuild[]> {
    const response =
        await fetch(
            `${DISCORD_API_BASE}/users/@me/guilds`,
            {
                headers: {
                    Authorization:
                        `Bearer ${accessToken}`,
                },
            }
        );

    if (!response.ok) {
        const text =
            await response.text();

        throw new Error(
            `Discord guild request failed: ${response.status} ${response.statusText} - ${text}`
        );
    }

    return response.json();
}
