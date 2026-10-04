import {
    env,
} from "cloudflare:workers";

const DISCORD_API_BASE =
    "https://discord.com/api/v10";

export type BotGuildRole = {
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
    /** Role flags; 1 = mentionable is irrelevant here, 16 = managed by integration. */
    flags: number;
};

export type BotGuildChannel = {
    id: string;
    name: string;
    /** Discord channel type: 0 text, 4 category, 5 announcement, 15 forum. */
    type: number;
    parentId: string | null;
    position: number;
};

export type BotGuildSnapshot = {
    memberCount: number | null;
    roles: BotGuildRole[];
    channels: BotGuildChannel[];
};

/**
 * Reads the bot token from Cloudflare bindings *and* `process.env`.
 *
 * The rest of the Studio reads secrets from `process.env`, but a Workers
 * deployment only has bindings; `devTools.ts` hit exactly that mismatch and
 * silently inverted a flag. Checking both keeps one convention for whoever
 * configures the deployment.
 */
function readSecret(name: string): string | undefined {
    const bindings =
        env as unknown as Record<
            string,
            string | undefined
        >;

    return (
        bindings[name] ??
        process.env[name]
    );
}

function getBotToken(): string | null {
    const token =
        readSecret("DISCORD_BOT_TOKEN")?.trim();

    return token ? token : null;
}

/**
 * The Access tab lists every role and channel in a server so an owner can
 * pick which ones may use the bot. That list belongs to the guild, not to the
 * signed-in user, and the OAuth token we hold is scoped to `identify guilds`
 * — so the only way to fetch it is the bot token.
 *
 * Every call degrades to `null` instead of throwing. A missing token, a bot
 * that has been kicked, or a Discord outage means the Access tab shows the
 * rules it already has plus a "roles unavailable" notice; it must not turn
 * into a 500, and it must never be the reason a settings page fails to
 * render.
 */
const CACHE_TTL_MS =
    60 * 1000;

type CacheEntry = {
    value: BotGuildSnapshot | null;
    expiresAt: number;
};

/**
 * Module-level, so it only helps within one isolate. That is deliberate:
 * a correct cross-instance cache would need the database, and role lists
 * change often enough that a minute of staleness is the most we want to
 * tolerate anyway.
 */
const cache =
    new Map<string, CacheEntry>();

async function fetchJson(
    path: string,
    token: string
): Promise<unknown | null> {
    const response =
        await fetch(
            `${DISCORD_API_BASE}${path}`,
            {
                headers: {
                    Authorization:
                        `Bot ${token}`,
                },
                cache: "no-store",
            }
        );

    if (response.status === 403 || response.status === 404) {
        // The bot is not in the guild, or lacks the intent/scope for the
        // resource. Not worth retrying until the cache expires.
        console.warn(
            `Discord bot request rejected for ${path}: ${response.status}`
        );

        return null;
    }

    if (!response.ok) {
        throw new Error(
            `Discord bot request failed: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : fallback;
}

function parseRoles(raw: unknown): BotGuildRole[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter(
            (role): role is Record<string, unknown> =>
                typeof role === "object" && role !== null
        )
        .filter(
            (role) => typeof role.id === "string"
        )
        .map((role) => ({
            id: role.id as string,
            name:
                typeof role.name === "string"
                    ? role.name
                    : "unnamed",
            color: asNumber(role.color),
            position: asNumber(role.position),
            managed: role.managed === true,
            flags: asNumber(role.flags),
        }))
        .sort(
            (a, b) => b.position - a.position
        );
}

function parseChannels(raw: unknown): BotGuildChannel[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .filter(
            (channel): channel is Record<string, unknown> =>
                typeof channel === "object" && channel !== null
        )
        .filter(
            (channel) => typeof channel.id === "string"
        )
        .map((channel) => ({
            id: channel.id as string,
            name:
                typeof channel.name === "string"
                    ? channel.name
                    : "unnamed",
            type: asNumber(channel.type),
            parentId:
                typeof channel.parent_id === "string"
                    ? channel.parent_id
                    : null,
            position: asNumber(channel.position),
        }))
        .sort(
            (a, b) => a.position - b.position
        );
}

/**
 * Roles, channels and member count for a guild, via the bot.
 *
 * `null` means "could not ask Discord" — no token configured, or the bot is
 * not present in the guild. Callers must treat that as "show what you have,
 * say the picker is unavailable", never as "the guild has no roles".
 */
export async function getGuildSnapshot(
    guildId: string
): Promise<BotGuildSnapshot | null> {
    if (!guildId) {
        return null;
    }

    const cached = cache.get(guildId);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const token = getBotToken();

    if (!token) {
        return null;
    }

    try {
        const [rolesRaw, channelsRaw, guildRaw] =
            await Promise.all([
                fetchJson(
                    `/guilds/${guildId}/roles`,
                    token
                ),

                fetchJson(
                    `/guilds/${guildId}/channels`,
                    token
                ),

                fetchJson(
                    `/guilds/${guildId}?with_counts=true`,
                    token
                ),
            ]);

        if (rolesRaw === null && channelsRaw === null) {
            cache.set(guildId, {
                value: null,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });

            return null;
        }

        const snapshot: BotGuildSnapshot = {
            memberCount:
                guildRaw &&
                typeof guildRaw === "object" &&
                typeof (guildRaw as Record<string, unknown>)
                    .approximate_member_count === "number"
                    ? ((guildRaw as Record<string, unknown>)
                          .approximate_member_count as number)
                    : null,

            roles: parseRoles(rolesRaw),
            channels: parseChannels(channelsRaw),
        };

        cache.set(guildId, {
            value: snapshot,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return snapshot;
    } catch (error) {
        console.error(
            `Discord guild snapshot failed for ${guildId}:`,
            error instanceof Error ? error.message : error
        );

        return null;
    }
}

/**
 * Drop the cached snapshot after the caller changes something that would
 * otherwise stay stale for a minute, e.g. after saving rules that reference
 * a role the owner just created.
 */
export function invalidateGuildSnapshot(
    guildId: string
) {
    cache.delete(guildId);
}

/**
 * Whether the Access tab can offer pickers at all. Checked separately from
 * `getGuildSnapshot` so a page can say "add DISCORD_BOT_TOKEN" once instead
 * of rendering an empty dropdown and leaving the owner to guess why.
 */
export function canReadGuildDirectory(): boolean {
    return getBotToken() !== null;
}

/* ------------------------------------------------------------------ *
 * Per-guild bot identity
 *
 * Discord lets a bot change its own member record inside one guild:
 * `PATCH /guilds/{guild.id}/members/@me` with `nick`, `avatar`, `banner`
 * and `bio`. Only `nick` needs a permission (CHANGE_NICKNAME); the images
 * and the bio need none. That is what makes a per-server bot avatar
 * possible at all — the same bot looks different in each server.
 * ------------------------------------------------------------------ */

export type BotGuildIdentity = {
    /** The bot's user id, needed to build avatar URLs. */
    userId: string;

    /** Server nickname, or null when the bot uses its global name. */
    nick: string | null;

    /** Guild avatar hash, or null when the bot uses its global avatar. */
    avatarHash: string | null;

    /** Global avatar hash, used as the fallback the guild avatar falls back to. */
    globalAvatarHash: string | null;

    /** The bot's global username, shown as the fallback name. */
    username: string;

    /** Best-effort display URL for the current guild avatar. */
    avatarUrl: string | null;
};

const CDN_BASE = "https://cdn.discordapp.com";

/**
 * The guild avatar, then the global avatar, then Discord's default.
 *
 * Mirrors what Discord itself renders, so the Studio preview is not a
 * guess. `users/{id}/avatars/{hash}` is the guild-scoped path.
 */
function buildAvatarUrl(
    guildId: string,
    userId: string,
    guildHash: string | null,
    globalHash: string | null
): string | null {
    if (guildHash) {
        const extension = guildHash.startsWith("a_")
            ? "gif"
            : "png";

        return `${CDN_BASE}/guilds/${guildId}/users/${userId}/avatars/${guildHash}.${extension}`;
    }

    if (globalHash) {
        const extension = globalHash.startsWith("a_")
            ? "gif"
            : "png";

        return `${CDN_BASE}/users/${userId}/avatars/${globalHash}.${extension}`;
    }

    /*
     * The default avatar is derived from the user id. Since the username
     * migration Discord uses `(id >> 22) % 6`, and the legacy formula only
     * applies to ids predating the shift — which no bot we serve does.
     */
    try {
        const index =
            Number(BigInt(userId) >> BigInt(22)) % 6;

        return `${CDN_BASE}/embed/avatars/${index}.png`;
    } catch {
        return null;
    }
}

function readString(
    value: unknown
): string | null {
    return typeof value === "string" && value
        ? value
        : null;
}

type BotSelf = {
    userId: string;
    username: string;
    avatarHash: string | null;
};

let botSelfCache:
    | { value: BotSelf; expiresAt: number }
    | null = null;

/**
 * Who the bot itself is, from `GET /users/@me`.
 *
 * Discord has no `GET /guilds/{id}/members/@me` — the `@me` member is only
 * writable. Reading the guild member needs the bot's real user id, so this
 * resolves it once and caches it; a bot's own identity does not change
 * often enough to be worth refetching on every page view.
 */
async function getBotSelf(
    token: string
): Promise<BotSelf | null> {
    if (botSelfCache && botSelfCache.expiresAt > Date.now()) {
        return botSelfCache.value;
    }

    const raw = await fetchJson("/users/@me", token);

    if (!raw || typeof raw !== "object") {
        return null;
    }

    const user = raw as Record<string, unknown>;
    const userId = readString(user.id);

    if (!userId) {
        return null;
    }

    const value: BotSelf = {
        userId,
        username:
            readString(user.username) ??
            "Aesthetic King",
        avatarHash: readString(user.avatar),
    };

    botSelfCache = {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return value;
}

/**
 * The bot's own member record in one guild.
 *
 * `null` means "could not ask Discord" — no token, or the bot was kicked.
 * Callers must render that as "unavailable", never as "no nickname set".
 */
export async function getBotGuildIdentity(
    guildId: string
): Promise<BotGuildIdentity | null> {
    const token = getBotToken();

    if (!token || !guildId) {
        return null;
    }

    const self = await getBotSelf(token).catch(
        () => null
    );

    if (!self) {
        return null;
    }

    /*
     * Degrades to null like the rest of this module: a 429 or a Discord
     * outage means "unavailable" in the UI, not a 500 on the Appearance
     * tab. The save path still reports errors, because there the owner
     * pressed a button and needs the truth.
     */
    const raw = await fetchJson(
        `/guilds/${guildId}/members/${self.userId}`,
        token
    ).catch(() => null);

    if (!raw || typeof raw !== "object") {
        return null;
    }

    const member = raw as Record<string, unknown>;
    const user = member.user as
        | Record<string, unknown>
        | undefined;

    const userId =
        readString(user?.id) ?? self.userId;

    const guildHash = readString(member.avatar);
    const globalHash =
        readString(user?.avatar) ?? self.avatarHash;

    return {
        userId,

        nick: readString(member.nick),
        avatarHash: guildHash,
        globalAvatarHash: globalHash,

        username:
            readString(user?.username) ??
            self.username,

        avatarUrl: buildAvatarUrl(
            guildId,
            userId,
            guildHash,
            globalHash
        ),
    };
}

/**
 * Discord's own limit for a server nickname.
 */
export const MAX_BOT_NICKNAME_LENGTH = 32;

const ACCEPTED_IMAGE_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);

/**
 * Discord rejects a request body over ~256 KB, and an avatar is resized
 * server-side to 4096px at most, so anything larger than this is wasted.
 */
const MAX_AVATAR_BYTES = 256 * 1024;

export type BotIdentityFailure = {
    error: string;
};

/**
 * Validates a `data:` URI before it is ever sent to Discord.
 *
 * The size check matters: base64 inflates by ~33%, so a 200 KB image
 * becomes a 267 KB body and Discord answers with a 400 that is far less
 * explainable than "that image is too large".
 */
export function validateAvatarDataUri(
    value: unknown
): string | null {
    if (typeof value !== "string") {
        return "Provide the avatar as a data URI.";
    }

    const match =
        /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(
            value
        );

    if (!match) {
        return "That does not look like an image.";
    }

    const mime = match[1].toLowerCase();

    if (!ACCEPTED_IMAGE_MIME.has(mime)) {
        return "Use a PNG, JPEG, WebP or GIF image.";
    }

    const base64 = match[2];

    /*
     * Decoded length from the encoded length, without allocating the
     * buffer: 4 characters carry 3 bytes, minus the padding.
     */
    const padding = base64.endsWith("==")
        ? 2
        : base64.endsWith("=")
            ? 1
            : 0;

    const bytes =
        Math.floor(base64.length / 4) * 3 - padding;

    if (bytes > MAX_AVATAR_BYTES) {
        return "That image is larger than 256 KB.";
    }

    return null;
}

export type BotIdentityResult =
    | { ok: true; identity: BotGuildIdentity | null }
    | { ok: false; error: string };

/**
 * Sets the bot's nickname and/or guild avatar in one guild.
 *
 * Absent keys are left untouched, matching the rest of the Studio's
 * partial-update contract. `null` for a key clears it and restores the
 * global value, which is exactly what Discord means by a null `nick` or
 * `avatar`.
 *
 * Unlike the read helpers this reports failure rather than degrading to
 * `null`: the owner pressed a button and needs to know whether it worked.
 */
export async function updateBotGuildIdentity(
    guildId: string,
    patch: {
        nick?: string | null;
        avatar?: string | null;
    }
): Promise<BotIdentityResult> {
    const token = getBotToken();

    if (!token) {
        return {
            ok: false,
            error:
                "This deployment has no bot token configured.",
        };
    }

    const body: Record<string, unknown> = {};

    if (patch.nick !== undefined) {
        if (patch.nick === null) {
            body.nick = null;
        } else {
            const nick = patch.nick.trim();

            if (nick.length > MAX_BOT_NICKNAME_LENGTH) {
                return {
                    ok: false,
                    error: `A nickname is at most ${MAX_BOT_NICKNAME_LENGTH} characters.`,
                };
            }

            body.nick = nick || null;
        }
    }

    if (patch.avatar !== undefined) {
        if (patch.avatar === null) {
            body.avatar = null;
        } else {
            const invalid = validateAvatarDataUri(
                patch.avatar
            );

            if (invalid) {
                return { ok: false, error: invalid };
            }

            body.avatar = patch.avatar;
        }
    }

    if (Object.keys(body).length === 0) {
        return {
            ok: true,
            identity:
                await getBotGuildIdentity(guildId),
        };
    }

    try {
        const response = await fetch(
            `${DISCORD_API_BASE}/guilds/${guildId}/members/@me`,
            {
                method: "PATCH",

                headers: {
                    Authorization: `Bot ${token}`,
                    "Content-Type": "application/json",
                },

                body: JSON.stringify(body),
                cache: "no-store",
            }
        );

        if (response.status === 403) {
            return {
                ok: false,
                error:
                    "The bot is not allowed to change its nickname in this server.",
            };
        }

        if (response.status === 404) {
            return {
                ok: false,
                error:
                    "Aesthetic King is not in this server anymore.",
            };
        }

        if (response.status === 413) {
            return {
                ok: false,
                error: "That image is too large.",
            };
        }

        if (!response.ok) {
            /*
             * Discord explains a rejected image in the JSON body, and that
             * message is more useful than a bare status code.
             */
            const detail = await response
                .json()
                .catch(() => null) as
                | Record<string, unknown>
                | null;

            const message =
                detail &&
                typeof detail.message === "string"
                    ? detail.message
                    : null;

            console.error(
                `Discord bot identity update failed for ${guildId}: ${response.status}`,
                detail ?? ""
            );

            return {
                ok: false,
                error:
                    message ??
                    "Discord rejected that change.",
            };
        }

        return {
            ok: true,
            identity:
                await getBotGuildIdentity(guildId),
        };
    } catch (error) {
        console.error(
            `Discord bot identity update errored for ${guildId}:`,
            error instanceof Error ? error.message : error
        );

        return {
            ok: false,
            error:
                "Could not reach Discord. Try again in a moment.",
        };
    }
}

