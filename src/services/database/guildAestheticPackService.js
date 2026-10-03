const {
    prisma,
} = require("./prisma");

async function getEnabledGuildPacks(
    discordGuildId
) {
    if (!discordGuildId) {
        return [];
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId:
                    discordGuildId,
            },

            select: {
                aestheticPacks: {
                    where: {
                        enabled: true,
                    },

                    orderBy: {
                        name: "asc",
                    },
                },
            },
        });

    return (
        guild?.aestheticPacks ??
        []
    );
}

async function getEnabledGuildPackById(
    discordGuildId,
    packId
) {
    if (
        !discordGuildId ||
        !packId
    ) {
        return null;
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId:
                    discordGuildId,
            },

            select: {
                aestheticPacks: {
                    where: {
                        id:
                            packId,

                        enabled:
                            true,
                    },

                    take: 1,
                },
            },
        });

    return (
        guild?.aestheticPacks?.[0] ??
        null
    );
}

async function getDefaultGuildPack(
    discordGuildId
) {
    if (!discordGuildId) {
        return null;
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId:
                    discordGuildId,
            },

            select: {
                settings: {
                    select: {
                        defaultPackId:
                            true,
                    },
                },
            },
        });

    const defaultPackId =
        guild?.settings
            ?.defaultPackId;

    if (!defaultPackId) {
        return null;
    }

    return getEnabledGuildPackById(
        discordGuildId,
        defaultPackId
    );
}

module.exports = {
    getEnabledGuildPacks,
    getEnabledGuildPackById,
    getDefaultGuildPack,
};
