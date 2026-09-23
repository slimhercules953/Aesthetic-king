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