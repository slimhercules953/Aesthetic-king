/*
 * Aesthetic matching resolves catalog sets out of the real asset library, so
 * this suite needs R2 credentials. Without them there is nothing to assert,
 * and failing for that reason would make CI red on every commit for something
 * that is simply not configured in that environment.
 *
 * The guard runs before the requires below because the asset service builds an
 * S3 client as soon as it is loaded.
 */
require("dotenv").config();

const R2_ENV_VARS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
];

const missingR2 = R2_ENV_VARS.filter((name) => !process.env[name]);

if (missingR2.length > 0) {
    require("../src/utils/logger").warn(
        `Skipping aesthetic matching — unset ${missingR2.join(", ")}.`
    );

    console.log("0 passed, 0 failed (skipped: no R2 credentials)");
    process.exit(0);
}

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