/*
 * The color diagnostic downloads a real banner from the asset library, so it
 * needs R2 credentials. Without them there is nothing to extract colours from,
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
        `Skipping colour diagnostic — unset ${missingR2.join(", ")}.`
    );

    console.log("0 passed, 0 failed (skipped: no R2 credentials)");
    process.exit(0);
}

const {
    getCompleteProfileSets,
    getAssetBuffer,
} = require("../src/services/assets/assetService");

const {
    extractColors,
    getMimeTypeFromExtension,
} = require("../src/services/colors/colorService");

const logger = require("../src/utils/logger");

async function testColors() {
    logger.info("Testing color extraction...");

    const sets = await getCompleteProfileSets();

    if (sets.length === 0) {
        throw new Error(
            "No complete profile sets are available."
        );
    }

    const profileSet = sets[0];
    const banner = profileSet.banner;

    const buffer = await getAssetBuffer(
        banner.key
    );

    const mimeType =
        getMimeTypeFromExtension(
            banner.extension
        );

    const colors = await extractColors(
        buffer,
        mimeType
    );

    logger.success(
        "Color extraction successful."
    );

    console.log("");
    console.log(
        `Profile Set: ${profileSet.id}`
    );

    console.log(
        `Banner: ${banner.key}`
    );

    console.log("");
    console.log("Extracted palette:");

    colors.forEach((color, index) => {
        console.log(
            `${index + 1}. ${color.hex} ` +
            `rgb(${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b})`
        );
    });
}

testColors().catch((error) => {
    logger.error(
        "Color diagnostic failed.",
        error
    );

    process.exit(1);
});