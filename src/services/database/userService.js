const {
    prisma,
} = require("./prisma");

function buildDiscordUserData(
    discordUser
) {
    if (
        !discordUser ||
        !discordUser.id
    ) {
        throw new Error(
            "A valid Discord user is required."
        );
    }

    return {
        discordId:
            discordUser.id,

        username:
            discordUser.username ||
            null,

        displayName:
            discordUser.globalName ||
            null,

        avatarHash:
            discordUser.avatar ||
            null,
    };
}

async function getUserByDiscordId(
    discordId
) {
    if (!discordId) {
        throw new Error(
            "A Discord user ID is required."
        );
    }

    return prisma.user.findUnique({
        where: {
            discordId,
        },
    });
}

async function createUserFromDiscord(
    discordUser
) {
    const data =
        buildDiscordUserData(
            discordUser
        );

    return prisma.user.create({
        data,
    });
}

async function getOrCreateUser(
    discordUser
) {
    const data =
        buildDiscordUserData(
            discordUser
        );

    return prisma.user.upsert({
        where: {
            discordId:
                data.discordId,
        },

        update: {
            username:
                data.username,

            displayName:
                data.displayName,

            avatarHash:
                data.avatarHash,
        },

        create: data,
    });
}

async function updateUserFromDiscord(
    discordUser
) {
    const data =
        buildDiscordUserData(
            discordUser
        );

    return prisma.user.update({
        where: {
            discordId:
                data.discordId,
        },

        data: {
            username:
                data.username,

            displayName:
                data.displayName,

            avatarHash:
                data.avatarHash,
        },
    });
}

module.exports = {
    getUserByDiscordId,
    createUserFromDiscord,
    getOrCreateUser,
    updateUserFromDiscord,
};