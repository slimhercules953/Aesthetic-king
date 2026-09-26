const {
    connectDatabase,
    disconnectDatabase,
} = require(
    "../src/services/database/prisma"
);

const {
    getOrCreateUser,
} = require(
    "../src/services/database/userService"
);

const {
    createSavedAesthetic,
    getSavedAesthetic,
    getUserSavedAesthetics,
    updateSavedAesthetic,
    deleteSavedAesthetic,
    countUserSavedAesthetics,
} = require(
    "../src/services/database/savedAestheticService"
);

const logger =
    require("../src/utils/logger");

const TEST_DISCORD_USER = {
    id:
        "999999999999999998",

    username:
        "saved_aesthetic_test",

    globalName:
        "Saved Aesthetic Test",

    avatar:
        null,
};

async function testSavedAestheticService() {
    logger.info(
        "Testing saved aesthetic service..."
    );

    await connectDatabase();

    const user =
        await getOrCreateUser(
            TEST_DISCORD_USER
        );

    const created =
        await createSavedAesthetic({
            userId:
                user.id,

            name:
                "Midnight Test",

            aestheticId:
                "gothic",

            moodId:
                "mysterious",

            colorFilter:
                "red",

            profileSetId:
                "38",

            usernameIdea:
                "velvetbyte",

            bio:
                "☾ coding somewhere beyond midnight",

            status:
                "† awake after dark",

            symbols: [
                "†",
                "☾",
                "✦",
            ],

            palette: [
                "#120D18",
                "#39213F",
                "#70437A",
                "#AD7CB2",
                "#D9B8DA",
            ],
        });

    console.log("");
    console.log(
        `Created: ${created.id}`
    );

    const fetched =
        await getSavedAesthetic(
            created.id
        );

    console.log(
        `Fetched: ${Boolean(
            fetched
        )}`
    );

    const updated =
        await updateSavedAesthetic(
            created.id,
            user.id,
            {
                name:
                    "Midnight Test Updated",

                status:
                    "☾ still awake",
            }
        );

    console.log(
        `Updated name: ${updated.name}`
    );

    const all =
        await getUserSavedAesthetics(
            user.id
        );

    console.log(
        `User saved aesthetics: ${all.length}`
    );

    const count =
        await countUserSavedAesthetics(
            user.id
        );

    console.log(
        `Count: ${count}`
    );

    const deleted =
        await deleteSavedAesthetic(
            created.id,
            user.id
        );

    console.log(
        `Deleted: ${deleted}`
    );

    logger.success(
        "Saved aesthetic service diagnostic completed successfully."
    );
}

testSavedAestheticService()
    .catch((error) => {
        logger.error(
            "Saved aesthetic service diagnostic failed.",
            error
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDatabase();
    });