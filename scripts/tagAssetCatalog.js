/*
 * Derives the `tags` facet for every set in src/data/assetCatalog.json.
 *
 * Tags are the fourth facet alongside aesthetics, moods and colors. The
 * first three answer "what is this" and "what does it feel like"; tags
 * answer "when would I reach for it", so they are deliberately allowed to
 * cross facets (a warm palette plus a calm mood is one tag).
 *
 * Every rule below is a claim about the *metadata*, never about pixels in
 * the image, because nothing here opens the R2 objects. That keeps the
 * generated vocabulary honest and re-runnable: run it again after
 * `generateAssetCatalog.js` and the derived tags stay in sync with the
 * aesthetics/moods/colors they came from.
 *
 * Hand-written tags survive a re-run. Anything in MANUAL_TAGS is merged
 * in and never removed, so a curator can pin a set with `tagAssetSet.js`
 * and regenerate the rest without losing the pin.
 *
 * Usage:
 *   node scripts/tagAssetCatalog.js           # write the catalog
 *   node scripts/tagAssetCatalog.js --dry-run # print the plan only
 */

const fs = require("fs");
const path = require("path");

const logger = require("../src/utils/logger");

const CATALOG_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

/*
 * Tags a curator owns. The generator will not delete these, which is what
 * makes it safe to re-run after re-tagging by hand.
 */
const MANUAL_TAGS = {};

const WARM_COLORS = new Set([
    "red",
    "orange",
    "yellow",
    "gold",
    "brown",
    "pink",
    "cream",
]);

const COOL_COLORS = new Set([
    "blue",
    "purple",
    "indigo",
    "teal",
    "green",
    "gray",
]);

const DARK_AESTHETICS = new Set([
    "dark",
    "gothic",
    "horror",
    "grunge",
    "monochrome",
]);

const SOFT_AESTHETICS = new Set([
    "soft",
    "pastel",
    "cottagecore",
    "romantic",
]);

const SPOOKY_MOODS = new Set([
    "macabre",
    "eerie",
    "ominous",
]);

const BOLD_MOODS = new Set([
    "energetic",
    "chaotic",
    "intense",
    "dramatic",
]);

const QUIET_MOODS = new Set([
    "calm",
    "gentle",
    "peaceful",
    "soft",
]);

const MOODY_MOODS = new Set([
    "moody",
    "melancholic",
    "atmospheric",
    "mysterious",
]);

function hasAny(values, wanted) {
    return (values || []).some((value) => wanted.has(value));
}

/**
 * Returns the derived tags for one catalog entry.
 *
 * Order is fixed so the output is stable regardless of how the source
 * arrays happen to be ordered.
 */
function deriveTags(set) {
    const aesthetics = set.aesthetics || [];
    const moods = set.moods || [];
    const colors = set.colors || [];

    const tags = [];

    const darkPalette =
        colors.includes("black") ||
        hasAny(aesthetics, DARK_AESTHETICS);

    const lightPalette =
        colors.includes("white") ||
        colors.includes("cream") ||
        colors.includes("gray");

    if (darkPalette) {
        tags.push("dark-palette");
    }

    if (lightPalette && !darkPalette) {
        tags.push("light-palette");
    }

    if (colors.includes("black") && (colors.includes("white") || colors.includes("cream"))) {
        tags.push("high-contrast");
    }

    if (hasAny(colors, WARM_COLORS)) {
        tags.push("warm-palette");
    }

    if (hasAny(colors, COOL_COLORS)) {
        tags.push("cool-palette");
    }

    if (colors.length === 1) {
        tags.push("monochrome-friendly");
    }

    if (colors.length >= 4) {
        tags.push("multicolor");
    }

    if (aesthetics.includes("cyber")) {
        tags.push("sci-fi");

        if (
            colors.includes("pink") ||
            colors.includes("purple")
        ) {
            tags.push("vaporwave");
        }
    }

    if (
        hasAny(aesthetics, SOFT_AESTHETICS) &&
        hasAny(moods, QUIET_MOODS)
    ) {
        tags.push("cozy");
    }

    if (hasAny(moods, MOODY_MOODS)) {
        tags.push("moody");
    }

    if (hasAny(moods, BOLD_MOODS)) {
        tags.push("bold");
    }

    if (hasAny(aesthetics, SPOOKY_MOODS) || hasAny(moods, SPOOKY_MOODS)) {
        tags.push("spooky");
    }

    if (aesthetics.includes("minimalist") || moods.includes("minimal")) {
        tags.push("minimal");
    }

    if (aesthetics.includes("luxury") || moods.includes("elegant")) {
        tags.push("elegant");
    }

    if (aesthetics.includes("nature") || aesthetics.includes("cottagecore")) {
        tags.push("nature");
    }

    if (moods.includes("night")) {
        tags.push("nighttime");
    }

    if (moods.includes("neon")) {
        tags.push("neon");
    }

    if (moods.includes("wintery")) {
        tags.push("winter");
    }

    if (moods.includes("nostalgic") || aesthetics.includes("grunge")) {
        tags.push("retro");
    }

    if (aesthetics.includes("dreamcore") && moods.includes("night")) {
        tags.push("dreamy-night");
    }

    if (set.premium === true) {
        tags.push("premium-pick");
    }

    return [
        ...new Set([
            ...tags,
            ...(MANUAL_TAGS[set.id] || []),
        ]),
    ].sort();
}

function tagAssetCatalog() {
    const dryRun = process.argv.includes("--dry-run");

    if (!fs.existsSync(CATALOG_PATH)) {
        throw new Error("assetCatalog.json does not exist.");
    }

    const catalog = JSON.parse(
        fs.readFileSync(CATALOG_PATH, "utf8")
    );

    const vocabulary = new Set();
    const changes = [];

    for (const set of catalog) {
        const tags = deriveTags(set);

        for (const tag of tags) {
            vocabulary.add(tag);
        }

        const before = JSON.stringify(set.tags || null);
        const after = JSON.stringify(tags);

        if (before !== after) {
            changes.push({ id: set.id, before, after });
            set.tags = tags;
        }
    }

    if (dryRun) {
        console.log(
            `Would update ${changes.length} of ${catalog.length} sets.`
        );
    } else {
        fs.writeFileSync(
            CATALOG_PATH,
            `${JSON.stringify(catalog, null, 2)}\n`
        );

        logger.success(
            `Updated ${changes.length} of ${catalog.length} sets.`
        );
    }

    console.log("");
    console.log(
        `Vocabulary (${vocabulary.size}): ${[...vocabulary]
            .sort()
            .join(", ")}`
    );
}

try {
    tagAssetCatalog();
} catch (error) {
    logger.error("Asset catalog tagging failed.", error);

    process.exit(1);
}
