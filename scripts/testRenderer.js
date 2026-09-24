const fs = require("fs");

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

const logger = require("../src/utils/logger");

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