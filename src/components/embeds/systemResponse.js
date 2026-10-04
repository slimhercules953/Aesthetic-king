const {
    EmbedBuilder,
} = require("discord.js");

const COLORS = {
    info: 0x7c5cff,
    success: 0x22c55e,
    error: 0xef4444,
    warning: 0xf59e0b,
};

function buildSystemEmbed({
    title,
    description,
    type = "info",
    footer = "Aesthetic King",
}) {
    const color =
        COLORS[type] ??
        COLORS.info;

    const embed =
        new EmbedBuilder()
            .setColor(
                color
            )
            .setTitle(
                title
            )
            .setDescription(
                description
            )
            .setFooter({
                text:
                    footer,
            });

    return embed;
}

function buildCommandDisabledEmbed(
    commandName
) {
    return buildSystemEmbed({
        title:
            "Command Disabled",

        description:
            `The \`/${commandName}\` command has been disabled in this server by an administrator.\n\nServer administrators can manage command availability in Aesthetic King Studio.`,

        type:
            "warning",
    });
}

function buildWrongChannelEmbed(
    generationChannelId
) {
    return buildSystemEmbed({
        title:
            "Wrong Channel",

        description:
            `This command is configured to be used in <#${generationChannelId}>.\n\nPlease run the command in the server's configured generation channel.`,

        type:
            "info",
    });
}

/**
 * Shown when a server-only command somehow arrives in a DM. Discord normally
 * hides those commands in DMs, so this is a backstop for a stale registration.
 */
function buildGuildOnlyCommandEmbed() {
    return buildSystemEmbed({
        title:
            "Server Command Only",

        description:
            "That command only works inside a server, where Aesthetic King uses the server's packs, defaults and generation channel.\n\nRun it in a server you share with the bot.",

        type:
            "info",
    });
}

function buildAccessDeniedEmbed(
    reason
) {
    const guidance =
        reason === "ALLOW_LIST"
            ? "This server restricts Aesthetic King to specific roles or channels, and you do not have one of them."
            : "This server restricted Aesthetic King for your role or the channel you used.";

    return buildSystemEmbed({
        title:
            "Not Available Here",

        description:
            `${guidance}\n\nA server administrator can change this in Aesthetic King Studio under **Server → Access**.`,

        type:
            "warning",
    });
}

function buildInteractionErrorEmbed() {
    return buildSystemEmbed({
        title:
            "Something Went Wrong",

        description:
            "Aesthetic King could not complete that interaction. Please try again.",

        type:
            "error",
    });
}

/**
 * Shown when a button's custom id matches no registered handler. That almost
 * always means the embed is older than the current deploy, so the honest
 * advice is to re-run the command rather than "something went wrong".
 */
function buildUnknownComponentEmbed() {
    return buildSystemEmbed({
        title:
            "This Button Is Out of Date",

        description:
            "Aesthetic King no longer recognises this button — it was probably posted by an older version of the bot. Run the command again to get a fresh one.",

        type:
            "warning",
    });
}

/**
 * Shown when the per-member limiter stops an action.
 *
 * `formattedRetryAfter` is a Discord timestamp token from
 * `rateLimitService.formatRetryAfter`, so the member sees "in about 2 minutes"
 * in their own timezone rather than a raw second count.
 */
function buildRateLimitedEmbed(formattedRetryAfter) {
    return buildSystemEmbed({
        title:
            "Slow Down",

        description:
            `You have sent too many requests to Aesthetic King. Try again ${formattedRetryAfter}.`,

        type: "warning",
    });
}

module.exports = {
    buildSystemEmbed,
    buildCommandDisabledEmbed,
    buildWrongChannelEmbed,
    buildAccessDeniedEmbed,
    buildGuildOnlyCommandEmbed,
    buildInteractionErrorEmbed,
    buildUnknownComponentEmbed,
    buildRateLimitedEmbed,
};
