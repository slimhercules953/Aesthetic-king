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

/**
 * Hosts a dev server may be reached on. Loopback plus the private
 * ranges a LAN address falls in, and the mDNS suffixes.
 */
function isPrivateHost(
    hostname: string
): boolean {
    const host =
        hostname
            .toLowerCase()
            .replace(/^\[|\]$/g, "");

    if (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".lan") ||
        host === "::1"
    ) {
        return true;
    }

    if (/^127\./.test(host)) {
        return true;
    }

    if (/^10\./.test(host)) {
        return true;
    }

    if (/^192\.168\./.test(host)) {
        return true;
    }

    return /^172\.(1[6-9]|2\d|3[01])\./.test(
        host
    );
}

/**
 * Where the browser is actually talking to this app.
 *
 * A dev server bound to every interface is reachable as localhost, as
 * a LAN IP, and as a machine name. Discord's `redirect_uri` must match
 * the registered value byte for byte, so hardcoding
 * `NEXT_PUBLIC_APP_URL` means anyone arriving over the IP gets sent
 * back to `localhost` — their own machine — and the login fails.
 *
 * In production the configured URL is the only answer. Trusting the
 * Host header there would let an attacker who can forge it send a
 * victim's auth code to an origin they control.
 */
export function resolveAppOrigin(
    requestUrl: string
): string {
    const configured =
        (
            process.env
                .NEXT_PUBLIC_APP_URL ?? ""
        )
            .trim()
            .replace(/\/+$/, "");

    if (
        process.env.NODE_ENV === "production"
    ) {
        if (!configured) {
            throw new Error(
                "NEXT_PUBLIC_APP_URL is not configured."
            );
        }

        return configured;
    }

    try {
        const url =
            new URL(
                requestUrl
            );

        if (
            url.protocol === "http:" &&
            isPrivateHost(
                url.hostname
            )
        ) {
            return url.origin;
        }
    } catch {
        /* fall through to the configured URL */
    }

    if (!configured) {
        throw new Error(
            "NEXT_PUBLIC_APP_URL is not configured."
        );
    }

    return configured;
}

/**
 * Whether cookies for this deployment must carry `Secure`.
 *
 * Deriving this from `NODE_ENV` was wrong twice over: the variable is
 * unreliable under Workers, so a production deploy could silently ship
 * session cookies without `Secure`, while a plain-http LAN dev server
 * would have had them rejected by the browser. The app origin is the
 * thing that actually decides it, and that is already resolved above.
 */
export function shouldUseSecureCookies(
    requestUrl: string
): boolean {
    try {
        return (
            new URL(
                resolveAppOrigin(
                    requestUrl
                )
            ).protocol === "https:"
        );
    } catch {
        return true;
    }
}

export const OAUTH_STATE_COOKIE_NAME =
    "discord_oauth_state";

export const OAUTH_VERIFIER_COOKIE_NAME =
    "discord_oauth_verifier";

/**
 * OAuth helpers that need the Web Crypto API.
 *
 * The authorization code flow is public-client shaped here: the
 * client secret is available to the worker, but the redirect happens
 * through the browser, where an attacker who can observe a redirect
 * or plant a link could try to redeem a code first. PKCE binds the
 * code to the same browser that started the flow, and the `state`
 * comparison below is constant-time so a mismatch cannot be measured
 * byte by byte.
 */

function bytesToBase64Url(
    bytes: ArrayBuffer | Uint8Array
): string {
    const view =
        bytes instanceof Uint8Array
            ? bytes
            : new Uint8Array(bytes);

    let binary = "";

    for (const byte of view) {
        binary += String.fromCharCode(
            byte
        );
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/**
 * Creates a PKCE verifier and its S256 challenge. The verifier is
 * 43-128 characters of unreserved base64url; 32 random bytes gives
 * 43, the shortest allowed and comfortably strong.
 */
export async function createPkcePair(): Promise<{
    codeVerifier: string;
    codeChallenge: string;
}> {
    const random =
        crypto.getRandomValues(
            new Uint8Array(32)
        );

    const codeVerifier =
        bytesToBase64Url(random);

    return {
        codeVerifier,
        codeChallenge:
            await computeCodeChallenge(
                codeVerifier
            ),
    };
}

export async function computeCodeChallenge(
    codeVerifier: string
): Promise<string> {
    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
                codeVerifier
            )
        );

    return bytesToBase64Url(digest);
}

/**
 * Compares two opaque strings without leaking which position first
 * differed. Lengths are checked up front — `timingSafeEqual` throws
 * on unequal lengths, and length is not secret for a random nonce.
 */
export function constantTimeEquals(
    a: string,
    b: string
): boolean {
    if (
        !a ||
        !b ||
        a.length !== b.length
    ) {
        return false;
    }

    const encoder =
        new TextEncoder();

    const left =
        encoder.encode(a);

    const right =
        encoder.encode(b);

    let diff = 0;

    for (let i = 0; i < left.length; i += 1) {
        diff |= left[i] ^ right[i];
    }

    return diff === 0;
}

function requireClientId(): string {
    const clientId =
        process.env.DISCORD_CLIENT_ID;

    if (!clientId) {
        throw new Error(
            "DISCORD_CLIENT_ID is not configured."
        );
    }

    return clientId;
}

export function getDiscordAuthorizeUrl(
    state: string,
    appUrl: string,
    codeChallenge?: string
) {
    const clientId =
        requireClientId();

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

    if (codeChallenge) {
        params.set(
            "code_challenge",
            codeChallenge
        );

        params.set(
            "code_challenge_method",
            "S256"
        );
    }

    return (
        "https://discord.com/oauth2/authorize?" +
        params.toString()
    );
}

export async function exchangeDiscordCode(
    code: string,
    appUrl: string,
    codeVerifier?: string
): Promise<DiscordOAuthTokenResponse> {
    const clientId =
        requireClientId();

    const clientSecret =
        process.env.DISCORD_CLIENT_SECRET;

    if (!clientSecret) {
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

    if (codeVerifier) {
        body.set(
            "code_verifier",
            codeVerifier
        );
    }

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

        // The upstream body explains the failure to us, not to the
        // person signing in, and it can echo back request details.
        console.error(
            `Discord token exchange failed: ${response.status} ${response.statusText} - ${text}`
        );

        throw new Error(
            "Discord rejected the login code. Please sign in again."
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

        console.error(
            `Discord token refresh failed: ${response.status} ${response.statusText} - ${text}`
        );

        throw new Error(
            "Discord could not refresh the stored login. Please sign in again."
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

        console.error(
            `Discord user request failed: ${response.status} ${response.statusText} - ${text}`
        );

        throw new Error(
            "Discord did not return your account. Please sign in again."
        );
    }

    return response.json();
}

/**
 * How long a fetched guild list stays usable.
 *
 * One Server Studio page view asks for the caller's guilds three times (the
 * page itself, the appearance route and the bot-identity route), and every
 * other Studio tab asks again on each API call. Discord rate-limits that
 * burst on `/users/@me/guilds` and answers with a 429, which the access guard
 * reports as "could not verify your permissions". Thirty seconds is short
 * enough that joining or losing a server shows up on the next visit to the
 * list, and long enough to absorb a page's worth of requests.
 */
const GUILD_CACHE_TTL_MS =
    30 * 1000;

const guildCache =
    new Map<
        string,
        { value: DiscordGuild[]; expiresAt: number }
    >();

/**
 * Requests already on their way to Discord, keyed the same way as the cache.
 *
 * The three calls in a page view start at almost the same moment, so a plain
 * TTL cache would still let all of them miss. Reusing the in-flight promise
 * collapses the burst into a single HTTP request.
 */
const guildRequests =
    new Map<string, Promise<DiscordGuild[]>>();

/**
 * Non-reversible cache key for an access token.
 *
 * The token itself must not be held in memory longer than the request that
 * needs it, and a cheap hash would risk collisions that leak one account's
 * server list to another, so this uses SHA-256.
 */
async function guildCacheKey(
    accessToken: string
): Promise<string> {
    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(accessToken)
        );

    return Array.from(new Uint8Array(digest))
        .map((byte) =>
            byte.toString(16).padStart(2, "0")
        )
        .join("");
}

function pruneGuildCache(): void {
    const now = Date.now();

    for (const [key, entry] of guildCache) {
        if (entry.expiresAt <= now) {
            guildCache.delete(key);
        }
    }

    // Tokens rotate on refresh, so entries are never overwritten in place.
    if (guildCache.size > 128) {
        guildCache.clear();
    }
}

export async function getDiscordGuilds(
    accessToken: string
): Promise<DiscordGuild[]> {
    const key = await guildCacheKey(accessToken);

    const cached = guildCache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const pending = guildRequests.get(key);

    if (pending) {
        return pending;
    }

    const request = (async () => {
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

            console.error(
                `Discord guild request failed: ${response.status} ${response.statusText} - ${text}`
            );

            throw new Error(
                "Discord did not return your servers. Please sign in again."
            );
        }

        return response.json() as Promise<DiscordGuild[]>;
    })();

    guildRequests.set(key, request);

    try {
        const guilds = await request;

        pruneGuildCache();

        guildCache.set(key, {
            value: guilds,
            expiresAt: Date.now() + GUILD_CACHE_TTL_MS,
        });

        return guilds;
    } finally {
        // Never cache a failure: the next caller should be able to retry.
        guildRequests.delete(key);
    }
}
