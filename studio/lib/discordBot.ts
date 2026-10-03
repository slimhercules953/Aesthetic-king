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
