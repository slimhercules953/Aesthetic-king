import {
    env,
} from "cloudflare:workers";

/**
 * Permissions the bot actually needs, as a Discord bitfield.
 *
 * Deliberately not `administrator`: an invite that asks to manage the
 * whole server gets refused by most owners, and the bot only ever reads
 * channels, posts embeds and files, plays showcase audio, and sets its
 * own nickname/avatar per server.
 *
 *   Add Reactions          64
 *   View Channels        1024
 *   Send Messages        2048
 *   Embed Links         16384
 *   Attach Files        32768
 *   Read Message History 65536
 *   Use External Emojis 262144
 *   Connect           1048576
 *   Speak             2097152
 *   Change Nickname  67108864
 *
 * Change Nickname is here because it is the only permission the per-server
 * bot identity needs: `PATCH /guilds/{id}/members/@me` requires it for `nick`
 * and requires nothing for the avatar. MANAGE_NICKNAMES is deliberately not
 * requested — it edits other members' nicknames, which the bot never does,
 * and moderation-flavored bits get invites declined.
 */
const BOT_PERMISSIONS =
    64 +
    1024 +
    2048 +
    16384 +
    32768 +
    65536 +
    262144 +
    1048576 +
    2097152 +
    67108864;

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

/**
 * The application (client) ID of the bot.
 *
 * For a Discord application the OAuth `DISCORD_CLIENT_ID` and the bot's
 * `CLIENT_ID` are the same number, so the Studio already has it. When it
 * is not configured we fall back to decoding it out of the bot token:
 * Discord tokens begin with the base64url of the application snowflake,
 * which is exactly how the library derives it too. That keeps the invite
 * working in a deployment where only the token was set.
 */
function getApplicationId(): string | null {
    const configured =
        readSecret(
            "DISCORD_CLIENT_ID"
        )?.trim();

    if (configured) {
        return configured;
    }

    const token =
        readSecret(
            "DISCORD_BOT_TOKEN"
        )?.trim();

    if (!token) {
        return null;
    }

    const segment = token.split(".")[0];

    if (!segment) {
        return null;
    }

    try {
        const decoded = atob(
            segment.replace(/-/g, "+").replace(
                /_/g,
                "/"
            )
        );

        return /^\d{5,}$/.test(decoded)
            ? decoded
            : null;
    } catch {
        return null;
    }
}

/**
 * Builds the OAuth2 URL that adds the bot to a server.
 *
 * `guild_id` is included so Discord pre-selects the server and the owner
 * lands straight on the confirmation sheet instead of a dropdown.
 * Returns null when the application ID cannot be determined, which the UI
 * renders as "invite not configured" rather than a broken link.
 */
export function getBotInviteUrl(
    discordGuildId?: string
): string | null {
    const clientId = getApplicationId();

    if (!clientId) {
        return null;
    }

    const params = new URLSearchParams({
        client_id: clientId,
        scope: "bot applications.commands",
        permissions: String(BOT_PERMISSIONS),
        disable_guild_select: discordGuildId
            ? "true"
            : "false",
    });

    if (discordGuildId) {
        params.set("guild_id", discordGuildId);
    }

    return (
        "https://discord.com/api/oauth2/authorize?" +
        params.toString()
    );
}
