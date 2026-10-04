#!/usr/bin/env node
/**
 * Phase 3 verification for the Asset Explorer query layer.
 *
 * `studio/lib/assetQuery.ts` is where every filter, sort and URL rule for
 * the asset library lives. It is TypeScript inside the Studio, which has no
 * test runner, so this script transpiles the real module with the Studio's
 * own esbuild and asserts against it. That means the checks run against the
 * shipped code rather than a JavaScript copy that could drift.
 *
 * Asserted behavior:
 *
 *   1. The catalog is well-formed and every set carries tags.
 *   2. URL parsing/building round-trips, including unknown and hostile
 *      values, so a hand-written link cannot produce a broken view.
 *   3. Facet semantics: OR within a facet, AND across facets.
 *   4. Sorting is total and stable.
 *   5. Facet counts ignore their own facet so chips stay explorable.
 *
 * Usage: node scripts/testAssetExplorer.js
 */

const fs = require("fs");
const path = require("path");

const esbuild = require(path.join(
    __dirname,
    "..",
    "studio",
    "node_modules",
    "esbuild"
));

const CATALOG_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

const QUERY_MODULE_PATH = path.join(
    __dirname,
    "..",
    "studio",
    "lib",
    "assetQuery.ts"
);

let passed = 0;
let failed = 0;

function check(label, condition, extra = "") {
    if (condition) {
        passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    } else {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`
        );
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/**
 * Compiles the Studio module to CommonJS and loads it from a data URL, so
 * the assertions below run the same source the browser bundle gets.
 */
function loadAssetQuery() {
    const result = esbuild.transformSync(
        fs.readFileSync(QUERY_MODULE_PATH, "utf8"),
        {
            loader: "ts",
            format: "cjs",
            target: "node20",
        }
    );

    const module = { exports: {} };

    // eslint-disable-next-line no-new-func
    new Function("module", "exports", "require", result.code)(
        module,
        module.exports,
        require
    );

    return module.exports;
}

/** Minimal stand-in for URLSearchParams with the same read shape. */
function paramsFrom(search) {
    const params = new URLSearchParams(search);

    return {
        get: (name) => params.get(name),
        getAll: (name) => params.getAll(name),
    };
}

function main() {
    const catalog = JSON.parse(
        fs.readFileSync(CATALOG_PATH, "utf8")
    );

    const {
        ASSET_FACETS,
        ASSET_SORTS,
        DEFAULT_ASSET_SORT,
        EMPTY_ASSET_QUERY,
        buildAssetQuery,
        facetCounts,
        filterAssetSets,
        isAssetQueryEmpty,
        parseAssetQuery,
        sortAssetSets,
        toggleFacetValue,
    } = loadAssetQuery();

    section("Catalog tags");

    check(
        "catalog is a non-empty array",
        Array.isArray(catalog) && catalog.length > 0,
        `length=${catalog.length}`
    );

    const missingTags = catalog.filter(
        (set) => !Array.isArray(set.tags) || set.tags.length === 0
    );

    check(
        "every set has at least one tag",
        missingTags.length === 0,
        `missing: ${missingTags.map((set) => set.id).join(",")}`
    );

    const unsorted = catalog.filter(
        (set) =>
            JSON.stringify(set.tags) !==
            JSON.stringify([...(set.tags || [])].sort())
    );

    check(
        "tags are sorted (stable regeneration)",
        unsorted.length === 0,
        `unsorted: ${unsorted.map((set) => set.id).join(",")}`
    );

    const duplicated = catalog.filter(
        (set) => new Set(set.tags || []).size !== (set.tags || []).length
    );

    check(
        "no set repeats a tag",
        duplicated.length === 0,
        `duplicated: ${duplicated.map((set) => set.id).join(",")}`
    );

    const malformedTags = catalog.filter((set) =>
        (set.tags || []).some(
            (tag) =>
                typeof tag !== "string" ||
                tag !== tag.trim().toLowerCase() ||
                /\s/.test(tag)
        )
    );

    check(
        "tags are lowercase, trimmed, single-word slugs",
        malformedTags.length === 0,
        `bad: ${malformedTags.map((set) => set.id).join(",")}`
    );

    const vocabulary = new Set(catalog.flatMap((set) => set.tags || []));

    check(
        "tag vocabulary is a curated size (10-60)",
        vocabulary.size >= 10 && vocabulary.size <= 60,
        `size=${vocabulary.size}`
    );

    const premiumTags = catalog.filter(
        (set) => (set.tags || []).includes("premium-pick") !== (set.premium === true)
    );

    check(
        "premium-pick matches the premium flag exactly",
        premiumTags.length === 0,
        `mismatched: ${premiumTags.map((set) => set.id).join(",")}`
    );

    section("URL parsing");

    const empty = parseAssetQuery(paramsFrom(""));

    check(
        "no params yields an empty query",
        isAssetQueryEmpty(empty),
        JSON.stringify(empty)
    );

    check(
        "default sort is applied",
        empty.sort === DEFAULT_ASSET_SORT,
        `sort=${empty.sort}`
    );

    const parsed = parseAssetQuery(
        paramsFrom(
            "q=dark%20purple&aesthetics=cyber,dark&colors=purple&tags=moody&favorites=1&sort=richest"
        )
    );

    check("q is read", parsed.q === "dark purple", `q=${parsed.q}`);
    check(
        "comma lists split into facets",
        JSON.stringify(parsed.aesthetics) === JSON.stringify(["cyber", "dark"]),
        JSON.stringify(parsed.aesthetics)
    );
    check("single values still parse", parsed.colors[0] === "purple");
    check("tags parse", parsed.tags[0] === "moody");
    check("favorites=1 enables the toggle", parsed.favoritesOnly === true);
    check("sort is honored", parsed.sort === "richest", `sort=${parsed.sort}`);

    const hostile = parseAssetQuery(
        paramsFrom("sort=../../etc/passwd&aesthetics=CYBER,,cyber&favorites=yes")
    );

    check(
        "unknown sort falls back to the default",
        hostile.sort === DEFAULT_ASSET_SORT,
        `sort=${hostile.sort}`
    );
    check(
        "facet values are lowercased and de-duplicated",
        JSON.stringify(hostile.aesthetics) === JSON.stringify(["cyber"]),
        JSON.stringify(hostile.aesthetics)
    );
    check(
        "only favorites=1 counts as enabled",
        hostile.favoritesOnly === false,
        `favoritesOnly=${hostile.favoritesOnly}`
    );

    section("URL building");

    check(
        "an empty query builds no search string",
        buildAssetQuery(EMPTY_ASSET_QUERY) === "",
        buildAssetQuery(EMPTY_ASSET_QUERY)
    );

    const roundTrip = buildAssetQuery(parsed);
    const reparsed = parseAssetQuery(paramsFrom(roundTrip));

    check(
        "build/parse round-trips",
        JSON.stringify(reparsed) === JSON.stringify(parsed),
        `${roundTrip} -> ${JSON.stringify(reparsed)}`
    );

    check(
        "default sort is omitted from the URL",
        !buildAssetQuery({
            ...EMPTY_ASSET_QUERY,
            q: "x",
            sort: DEFAULT_ASSET_SORT,
        }).includes("sort=")
    );

    check(
        "search terms are escaped",
        buildAssetQuery({ ...EMPTY_ASSET_QUERY, q: "a b&c" }) === "q=a%20b%26c",
        buildAssetQuery({ ...EMPTY_ASSET_QUERY, q: "a b&c" })
    );

    section("Filtering");

    const all = catalog.filter((set) => set.enabled !== false);

    check(
        "an empty query matches every enabled set",
        filterAssetSets(all, EMPTY_ASSET_QUERY).length === all.length,
        `got ${filterAssetSets(all, EMPTY_ASSET_QUERY).length} of ${all.length}`
    );

    const cyberOrDark = filterAssetSets(all, {
        ...EMPTY_ASSET_QUERY,
        aesthetics: ["cyber", "dark"],
    });

    check(
        "values within one facet are OR'd",
        cyberOrDark.every(
            (set) =>
                set.aesthetics.includes("cyber") ||
                set.aesthetics.includes("dark")
        ) &&
            cyberOrDark.length >=
                filterAssetSets(all, {
                    ...EMPTY_ASSET_QUERY,
                    aesthetics: ["cyber"],
                }).length
    );

    const cyberAndPurple = filterAssetSets(all, {
        ...EMPTY_ASSET_QUERY,
        aesthetics: ["cyber"],
        colors: ["purple"],
    });

    check(
        "facets are AND'd",
        cyberAndPurple.every(
            (set) =>
                set.aesthetics.includes("cyber") &&
                set.colors.includes("purple")
        )
    );

    check(
        "adding a facet never widens the result",
        cyberAndPurple.length <=
            filterAssetSets(all, {
                ...EMPTY_ASSET_QUERY,
                aesthetics: ["cyber"],
            }).length
    );

    const tagged = filterAssetSets(all, {
        ...EMPTY_ASSET_QUERY,
        tags: ["vaporwave"],
    });

    check(
        "tags filter the library",
        tagged.length > 0 &&
            tagged.every((set) => (set.tags || []).includes("vaporwave")),
        `count=${tagged.length}`
    );

    const impossible = filterAssetSets(all, {
        ...EMPTY_ASSET_QUERY,
        tags: ["definitely-not-a-tag"],
    });

    check("an unknown tag matches nothing", impossible.length === 0);

    const searched = filterAssetSets(all, {
        ...EMPTY_ASSET_QUERY,
        q: "dark purple",
    });

    check(
        "multi-word search requires every word somewhere",
        searched.length > 0 &&
            searched.every((set) => {
                const haystack = [
                    set.id,
                    ...set.aesthetics,
                    ...set.moods,
                    ...set.colors,
                    ...(set.tags || []),
                ]
                    .join(" ")
                    .toLowerCase();

                return haystack.includes("dark") && haystack.includes("purple");
            }),
        `count=${searched.length}`
    );

    const searchedReversed = filterAssetSets(all, {
        ...EMPTY_ASSET_QUERY,
        q: "purple dark",
    });

    check(
        "search word order does not matter",
        searchedReversed.length === searched.length
    );

    const favorites = filterAssetSets(
        all,
        { ...EMPTY_ASSET_QUERY, favoritesOnly: true },
        [all[0].id, all[1].id]
    );

    check(
        "favorites-only keeps just the favorite ids",
        favorites.length === 2,
        `count=${favorites.length}`
    );

    check(
        "facet values match case-insensitively",
        filterAssetSets(all, {
            ...EMPTY_ASSET_QUERY,
            colors: ["PURPLE"],
        }).length ===
            filterAssetSets(all, {
                ...EMPTY_ASSET_QUERY,
                colors: ["purple"],
            }).length
    );

    section("Sorting");

    for (const sort of ASSET_SORTS) {
        const sorted = sortAssetSets(all, sort);

        check(
            `sort "${sort}" is a permutation of the input`,
            sorted.length === all.length &&
                new Set(sorted.map((set) => set.id)).size === all.length
        );
    }

    const newest = sortAssetSets(all, "newest");
    const oldest = sortAssetSets(all, "oldest");

    check(
        "newest is the reverse of oldest by id",
        Number(newest[0].id) === Math.max(...all.map((set) => Number(set.id))) &&
            Number(oldest[0].id) === Math.min(...all.map((set) => Number(set.id)))
    );

    const richest = sortAssetSets(all, "richest");
    const tagCount = (set) =>
        set.aesthetics.length +
        set.moods.length +
        set.colors.length +
        (set.tags || []).length;

    let richestOrdered = true;

    for (let i = 1; i < richest.length; i += 1) {
        if (tagCount(richest[i - 1]) < tagCount(richest[i])) {
            richestOrdered = false;
            break;
        }
    }

    check("richest sorts by total metadata descending", richestOrdered);

    const input = [...all];
    sortAssetSets(input, "richest");

    check(
        "sorting does not mutate its input",
        JSON.stringify(input.map((set) => set.id)) ===
            JSON.stringify(all.map((set) => set.id))
    );

    section("Facet counts and toggling");

    const chosen = {
        ...EMPTY_ASSET_QUERY,
        aesthetics: ["cyber"],
    };

    check(
        "a selected chip's count is that value alone under the other facets",
        facetCounts(all, chosen, "aesthetics", "cyber") ===
            filterAssetSets(all, {
                ...EMPTY_ASSET_QUERY,
                aesthetics: ["cyber"],
            }).length,
        `${facetCounts(all, chosen, "aesthetics", "cyber")}`
    );

    check(
        "a selected chip's count ignores sibling values in its own facet",
        facetCounts(all, {
            ...EMPTY_ASSET_QUERY,
            aesthetics: ["cyber", "dark"],
        }, "aesthetics", "cyber") ===
            filterAssetSets(all, chosen).length
    );

    check(
        "an unselected chip's count previews the narrowing",
        facetCounts(all, chosen, "colors", "purple") ===
            filterAssetSets(all, {
                ...chosen,
                colors: ["purple"],
            }).length
    );

    check(
        "toggling a value on adds it",
        JSON.stringify(toggleFacetValue(["cyber"], "dark")) ===
            JSON.stringify(["cyber", "dark"])
    );

    check(
        "toggling a value off removes it",
        JSON.stringify(toggleFacetValue(["cyber", "dark"], "cyber")) ===
            JSON.stringify(["dark"])
    );

    check(
        "every facet is filterable",
        ASSET_FACETS.length === 4 &&
            ASSET_FACETS.every((facet) => facet in EMPTY_ASSET_QUERY),
        JSON.stringify(ASSET_FACETS)
    );

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    if (failed > 0) {
        process.exit(1);
    }
}

try {
    main();
} catch (error) {
    console.error(error);
    process.exit(1);
}
