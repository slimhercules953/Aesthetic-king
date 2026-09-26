const fs = require("fs");
const path = require("path");

const {
    getCompleteProfileSets,
    refreshAssetCache,
} = require("../src/services/assets/assetService");

const logger = require("../src/utils/logger");

const OUTPUT_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

const BACKUP_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.backup.json"
);

function loadExistingCatalog() {
    if (!fs.existsSync(OUTPUT_PATH)) {
        return [];
    }

    const contents =
        fs.readFileSync(
            OUTPUT_PATH,
            "utf8"
        );

    if (!contents.trim()) {
        return [];
    }

    const catalog =
        JSON.parse(contents);

    if (!Array.isArray(catalog)) {
        throw new Error(
            "assetCatalog.json must contain an array."
        );
    }

    return catalog;
}

function createBackup() {
    if (!fs.existsSync(OUTPUT_PATH)) {
        return;
    }

    fs.copyFileSync(
        OUTPUT_PATH,
        BACKUP_PATH
    );
}

function createNewCatalogEntry(set) {
    return {
        id: set.id,

        assets: {
            pfp: set.pfp.key,
            banner: set.banner.key,
        },

        aesthetics: [],
        moods: [],
        colors: [],

        enabled: true,
    };
}

function mergeCatalogEntry(
    existingEntry,
    profileSet
) {
    return {
        ...existingEntry,

        id: profileSet.id,

        assets: {
            pfp:
                profileSet.pfp.key,

            banner:
                profileSet.banner.key,
        },

        aesthetics:
            Array.isArray(
                existingEntry.aesthetics
            )
                ? existingEntry.aesthetics
                : [],

        moods:
            Array.isArray(
                existingEntry.moods
            )
                ? existingEntry.moods
                : [],

        colors:
            Array.isArray(
                existingEntry.colors
            )
                ? existingEntry.colors
                : [],

        enabled:
            existingEntry.enabled !==
            false,
    };
}

function sortCatalog(catalog) {
    return catalog.sort(
        (a, b) =>
            a.id.localeCompare(
                b.id,
                undefined,
                {
                    numeric: true,
                }
            )
    );
}

async function generateAssetCatalog() {
    logger.info(
        "Refreshing R2 asset cache..."
    );

    await refreshAssetCache();

    logger.info(
        "Generating asset catalog..."
    );

    const existingCatalog =
        loadExistingCatalog();

    const existingMap =
        new Map(
            existingCatalog.map(
                (entry) => [
                    entry.id,
                    entry,
                ]
            )
        );

    const profileSets =
        await getCompleteProfileSets();

    const currentR2Ids =
        new Set(
            profileSets.map(
                (set) => set.id
            )
        );

    const mergedCatalog = [];

    let preservedCount = 0;
    let newCount = 0;
    let changedAssetCount = 0;

    for (
        const profileSet
        of profileSets
    ) {
        const existingEntry =
            existingMap.get(
                profileSet.id
            );

        if (!existingEntry) {
            mergedCatalog.push(
                createNewCatalogEntry(
                    profileSet
                )
            );

            newCount++;

            continue;
        }

        const oldPfp =
            existingEntry
                .assets?.pfp;

        const oldBanner =
            existingEntry
                .assets?.banner;

        if (
            oldPfp !==
                profileSet.pfp.key ||
            oldBanner !==
                profileSet.banner.key
        ) {
            changedAssetCount++;
        }

        mergedCatalog.push(
            mergeCatalogEntry(
                existingEntry,
                profileSet
            )
        );

        preservedCount++;
    }

    const missingEntries =
        existingCatalog.filter(
            (entry) =>
                !currentR2Ids.has(
                    entry.id
                )
        );

    /*
     * Preserve catalog entries that are
     * currently missing from R2.
     *
     * We do NOT silently delete them.
     */
    for (
        const missingEntry
        of missingEntries
    ) {
        mergedCatalog.push(
            missingEntry
        );
    }

    const sortedCatalog =
        sortCatalog(
            mergedCatalog
        );

    /*
     * Create a backup before overwriting
     * the main catalog.
     */
    createBackup();

    fs.writeFileSync(
        OUTPUT_PATH,
        `${JSON.stringify(
            sortedCatalog,
            null,
            2
        )}\n`
    );

    logger.success(
        `Asset catalog updated with ${sortedCatalog.length} total entries.`
    );

    console.log("");
    console.log(
        `Current complete R2 sets: ${profileSets.length}`
    );

    console.log(
        `Existing sets preserved: ${preservedCount}`
    );

    console.log(
        `New sets added: ${newCount}`
    );

    console.log(
        `Asset paths changed: ${changedAssetCount}`
    );

    console.log(
        `Catalog sets missing from R2: ${missingEntries.length}`
    );

    if (
        missingEntries.length >
        0
    ) {
        console.log("");
        console.log(
            "Missing set IDs:"
        );

        console.log(
            missingEntries
                .map(
                    (entry) =>
                        entry.id
                )
                .join(", ")
        );

        console.log("");
        console.log(
            "These entries were preserved and were NOT deleted."
        );
    }

    console.log("");
    console.log(
        `Catalog: ${OUTPUT_PATH}`
    );

    if (
        fs.existsSync(
            BACKUP_PATH
        )
    ) {
        console.log(
            `Backup: ${BACKUP_PATH}`
        );
    }
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