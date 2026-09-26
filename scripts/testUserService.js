const {
    connectDatabase,
    disconnectDatabase,
} = require(
    "../src/services/database/prisma"
);

const {
    getUserByDiscordId,
    getOrCreateUser,
} = require(
    "../src/services/database/userService"
);

const logger =
    require("../src/utils/logger");

const TEST_DISCORD_USER = {
    id:
        "999999999999999999",

    username:
        "aesthetic_test_user",

    globalName:
        "Aesthetic Test User",

    avatar:
        null,
};

async function testUserService() {
    logger.info(
        "Testing user service..."
    );

    await connectDatabase();

    const user =
        await getOrCreateUser(
            TEST_DISCORD_USER
        );

    console.log("");
    console.log(
        `Database ID: ${user.id}`
    );

    console.log(
        `Discord ID: ${user.discordId}`
    );

    console.log(
        `Username: ${user.username}`
    );

    console.log(
        `Display Name: ${user.displayName}`
    );

    const fetched =
        await getUserByDiscordId(
            TEST_DISCORD_USER.id
        );

    console.log("");
    console.log(
        `Lookup successful: ${Boolean(
            fetched
        )}`
    );

    logger.success(
        "User service diagnostic completed successfully."
    );
}

testUserService()
    .catch((error) => {
        logger.error(
            "User service diagnostic failed.",
            error
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDatabase();
    });