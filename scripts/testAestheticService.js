const {
    getMatchingProfileSets,
    getRandomMatchingProfileSet,
} = require(
    "../src/services/aesthetics/aestheticService"
);

const logger =
    require("../src/utils/logger");

async function testAestheticService() {
    logger.info(
        "Testing aesthetic matching..."
    );

    const gothicSets =
        await getMatchingProfileSets({
            aestheticId: "gothic",
        });

    console.log("");
    console.log(
        `Gothic sets: ${gothicSets.length}`
    );

    console.log(
        gothicSets
            .map((set) => set.id)
            .join(", ")
    );

    const randomGothic =
        await getRandomMatchingProfileSet({
            aestheticId: "gothic",
        });

    console.log("");
    console.log(
        `Random Gothic Set: ${randomGothic.id}`
    );

    console.log(
        `PFP: ${randomGothic.pfp.key}`
    );

    console.log(
        `Banner: ${randomGothic.banner.key}`
    );

    console.log(
        `Tags: ${randomGothic.metadata.aesthetics.join(", ")}`
    );

    const blueAnimeSets =
        await getMatchingProfileSets({
            aestheticId: "anime",
            color: "blue",
        });

    console.log("");
    console.log(
        `Blue Anime sets: ${blueAnimeSets.length}`
    );

    console.log(
        blueAnimeSets
            .map((set) => set.id)
            .join(", ")
    );

    logger.success(
        "Aesthetic matching works."
    );
}

testAestheticService().catch(
    (error) => {
        logger.error(
            "Aesthetic service test failed.",
            error
        );

        process.exit(1);
    }
);