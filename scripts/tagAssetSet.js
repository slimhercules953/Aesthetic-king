const fs = require("fs");
const path = require("path");

const {
    getAesthetic,
} = require("../src/data/aesthetics");

const logger = require("../src/utils/logger");

const CATALOG_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

function loadCatalog() {
    if (!fs.existsSync(CATALOG_PATH)) {
        throw new Error(
            "assetCatalog.json does not exist."
        );
    }

    return JSON.parse(
        fs.readFileSync(
            CATALOG_PATH,
            "utf8"
        )
    );
}

function saveCatalog(catalog) {
    fs.writeFileSync(
        CATALOG_PATH,
        `${JSON.stringify(
            catalog,
            null,
            2
        )}\n`
    );
}

function tagAssetSet() {
    const [
        ,
        ,
        setId,
        ...aestheticIds
    ] = process.argv;

    if (!setId) {
        throw new Error(
            "A profile set ID is required."
        );
    }

    if (aestheticIds.length === 0) {
        throw new Error(
            "At least one aesthetic is required."
        );
    }

    const normalizedAesthetics =
        aestheticIds.map(
            (id) =>
                id.toLowerCase().trim()
        );

    for (
        const aestheticId
        of normalizedAesthetics
    ) {
        if (!getAesthetic(aestheticId)) {
            throw new Error(
                `Unknown aesthetic: ${aestheticId}`
            );
        }
    }

    const catalog = loadCatalog();

    const profileSet =
        catalog.find(
            (set) =>
                set.id === setId
        );

    if (!profileSet) {
        throw new Error(
            `Profile set ${setId} was not found.`
        );
    }

    profileSet.aesthetics = [
        ...new Set(
            normalizedAesthetics
        ),
    ];

    saveCatalog(catalog);

    logger.success(
        `Updated profile set ${setId}.`
    );

    console.log("");
    console.log(
        `Aesthetics: ${profileSet.aesthetics.join(", ")}`
    );
}

try {
    tagAssetSet();
} catch (error) {
    logger.error(
        "Asset tagging failed.",
        error
    );

    process.exit(1);
}