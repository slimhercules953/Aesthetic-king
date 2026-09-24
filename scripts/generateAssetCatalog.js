const fs = require("fs");
const path = require("path");

const {
    getCompleteProfileSets,
} = require("../src/services/assets/assetService");

const logger = require("../src/utils/logger");

const OUTPUT_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

async function generateAssetCatalog() {
    logger.info(
        "Generating asset catalog..."
    );

    const profileSets =
        await getCompleteProfileSets();

    const catalog =
        profileSets
            .map((set) => ({
                id: set.id,

                assets: {
                    pfp: set.pfp.key,
                    banner: set.banner.key,
                },

                aesthetics: [],

                moods: [],

                enabled: true,
            }))
            .sort((a, b) =>
                a.id.localeCompare(
                    b.id,
                    undefined,
                    {
                        numeric: true,
                    }
                )
            );

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(
            catalog,
            null,
            2
        )
    );

    logger.success(
        `Generated catalog with ${catalog.length} profile sets.`
    );

    console.log("");
    console.log(
        `Created: ${OUTPUT_PATH}`
    );
}

generateAssetCatalog().catch(
    (error) => {
        logger.error(
            "Asset catalog generation failed.",
            error
        );

        process.exit(1);
    }
);