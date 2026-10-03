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

module.exports = {
    buildSystemEmbed,
    buildCommandDisabledEmbed,
    buildWrongChannelEmbed,
    buildAccessDeniedEmbed,
    buildInteractionErrorEmbed,
};
