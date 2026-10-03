const {
    prisma,
} = require("./prisma");

async function isGuildCommandEnabled(
    discordGuildId,
    commandName
) {
    if (
        !discordGuildId ||
        !commandName
    ) {
        return true;
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId:
                    discordGuildId,
            },
            select: {
                id: true,
            },
        });

    if (!guild) {
        return true;
    }

    const setting =
        await prisma.guildCommandSetting.findUnique({
            where: {
                guildId_commandName: {
                    guildId:
                        guild.id,
                    commandName,
                },
            },
        });

    return (
        setting?.enabled ??
        true
    );
}

module.exports = {
    isGuildCommandEnabled,
};
