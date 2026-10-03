const {
    prisma,
} = require("./prisma");

function buildGuildData(
    guild
) {
    if (
        !guild ||
        !guild.id
    ) {
        throw new Error(
            "A valid Discord guild is required."
        );
    }

    return {
        discordId:
            guild.id,

        name:
            guild.name ||
            null,

        iconHash:
            guild.icon ||
            null,
    };
}

async function getGuildByDiscordId(
    discordId
) {
    if (!discordId) {
        throw new Error(
            "A Discord guild ID is required."
        );
    }

    return prisma.guild.findUnique({
        where: {
            discordId,
        },
        include: {
            settings: true,
        },
    });
}

async function upsertGuildFromDiscord(
    guild
) {
    const data =
        buildGuildData(
            guild
        );

    return prisma.guild.upsert({
        where: {
            discordId:
                data.discordId,
        },

        update: {
            name:
                data.name,

            iconHash:
                data.iconHash,
        },

        create: data,
    });
}

async function removeGuildByDiscordId(
    discordId
) {
    if (!discordId) {
        throw new Error(
            "A Discord guild ID is required."
        );
    }

    return prisma.guild.deleteMany({
        where: {
            discordId,
        },
    });
}

async function syncGuildsFromDiscord(
    guilds
) {
    if (!guilds) {
        throw new Error(
            "A Discord guild collection is required."
        );
    }

    const discordGuilds =
        Array.from(
            guilds.values()
        );

    const discordGuildIds =
        discordGuilds.map(
            (guild) =>
                guild.id
        );

    await prisma.$transaction(
        discordGuilds.map(
            (guild) => {
                const data =
                    buildGuildData(
                        guild
                    );

                return prisma.guild.upsert({
                    where: {
                        discordId:
                            data.discordId,
                    },

                    update: {
                        name:
                            data.name,

                        iconHash:
                            data.iconHash,
                    },

                    create: data,
                });
            }
        )
    );

    if (
        discordGuildIds.length ===
        0
    ) {
        await prisma.guild.deleteMany();

        return;
    }

    await prisma.guild.deleteMany({
        where: {
            discordId: {
                notIn:
                    discordGuildIds,
            },
        },
    });
}

module.exports = {
    getGuildByDiscordId,
    upsertGuildFromDiscord,
    removeGuildByDiscordId,
    syncGuildsFromDiscord,
};