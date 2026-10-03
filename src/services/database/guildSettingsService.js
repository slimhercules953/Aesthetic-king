const {
    prisma,
} = require("./prisma");

async function getGuildSettingsByDiscordId(
    discordGuildId
) {
    if (!discordGuildId) {
        throw new Error(
            "A Discord guild ID is required."
        );
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId:
                    discordGuildId,
            },

            include: {
                settings: true,
            },
        });

    if (!guild) {
        return null;
    }

    return guild.settings;
}

async function getGenerationChannelId(
    discordGuildId
) {
    const settings =
        await getGuildSettingsByDiscordId(
            discordGuildId
        );

    return (
        settings?.generationChannelId ??
        null
    );
}

async function getDefaultAestheticId(
    discordGuildId
) {
    const settings =
        await getGuildSettingsByDiscordId(
            discordGuildId
        );

    return (
        settings?.defaultAestheticId ??
        null
    );
}

async function getDefaultMoodId(
    discordGuildId
) {
    const settings =
        await getGuildSettingsByDiscordId(
            discordGuildId
        );

    return (
        settings?.defaultMoodId ??
        null
    );
}

module.exports = {
    getGuildSettingsByDiscordId,
    getGenerationChannelId,
    getDefaultAestheticId,
    getDefaultMoodId,
};