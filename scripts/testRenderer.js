const fs = require("fs");

const logger = require("../src/utils/logger");

/*
 * Renders a real preview from a random set pulled out of R2, so it needs the
 * same credentials as the R2 diagnostic. Skipped rather than failed when they
 * are absent — see scripts/testR2.js for the reasoning.
 *
 * dotenv is loaded explicitly because the guard below must run before the
 * asset service is required: that module builds an S3 client at require time.
 */
require("dotenv").config();

const R2_ENV_VARS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
];

const missing = R2_ENV_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
    logger.warn(
        `Skipping renderer diagnostic — unset ${missing.join(", ")}.`
    );

    console.log("0 passed, 0 failed (skipped: no R2 credentials)");
    process.exit(0);
}

const {
    getRandomProfileSet,
    getAssetBuffer,
} = require("../src/services/assets/assetService");

const {
    extractColors,
    getMimeTypeFromExtension,
} = require("../src/services/colors/colorService");

const {
    renderProfilePreview,
} = require("../src/services/rendering/profileRenderer");

async function testRenderer() {
    logger.info(
        "Testing profile renderer..."
    );

    const profileSet =
        await getRandomProfileSet();

    const bannerBuffer =
        await getAssetBuffer(
            profileSet.banner.key
        );

    const colors =
        await extractColors(
            bannerBuffer,
            getMimeTypeFromExtension(
                profileSet.banner.extension
            )
        );

    const previewBuffer =
        await renderProfilePreview({
            pfpUrl:
                profileSet.pfp.url,

            bannerUrl:
                profileSet.banner.url,

            colors,

            username:
                "Aesthetic King",

            bio:
                "building an aesthetic identity ✦",
        });

    fs.writeFileSync(
        "output-v2-theme.png",
        previewBuffer
    );

    logger.success(
        "Profile renderer test completed."
    );

    console.log("");
    console.log(
        `Profile Set: ${profileSet.id}`
    );

    console.log(
        "Created: output-v2-theme.png"
    );
}

testRenderer().catch((error) => {
    logger.error(
        "Profile renderer diagnostic failed.",
        error
    );

    process.exit(1);
});