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
    buildInteractionErrorEmbed,
};
