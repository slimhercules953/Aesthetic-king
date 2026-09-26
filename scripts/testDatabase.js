const {
    prisma,
    connectDatabase,
    disconnectDatabase,
} = require(
    "../src/services/database/prisma"
);

const logger =
    require("../src/utils/logger");

async function testDatabase() {
    logger.info(
        "Testing PostgreSQL connection..."
    );

    await connectDatabase();

    const userCount =
        await prisma.user.count();

    const guildCount =
        await prisma.guild.count();

    const aestheticCount =
        await prisma.savedAesthetic.count();

    console.log("");
    console.log(
        `Users: ${userCount}`
    );

    console.log(
        `Guilds: ${guildCount}`
    );

    console.log(
        `Saved Aesthetics: ${aestheticCount}`
    );

    logger.success(
        "Database diagnostic completed successfully."
    );
}

testDatabase()
    .catch((error) => {
        logger.error(
            "Database diagnostic failed.",
            error
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDatabase();
    });