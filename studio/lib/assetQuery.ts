/**
 * Asset Explorer query layer.
 *
 * Everything about interpreting the library URL lives here as pure
 * functions so it can be unit-tested without a browser: the component
 * reads `useSearchParams()`, hands it to `parseAssetQuery()`, and writes
 * the result back with `buildAssetQuery()`. That is what makes a filtered
 * view reload-stable and shareable.
 *
 * Facet semantics: values within one facet are OR'd, facets are AND'd.
 * "cyber OR dark" AND "purple" means *a cyber or dark set that is also
 * purple*, which is what people expect from stacked filters.
 */

import type { AssetCatalogSet } from "./assetCatalog";

export type AssetFacet =
    | "aesthetics"
    | "moods"
    | "colors"
    | "tags";

export const ASSET_FACETS = [
    "aesthetics",
    "moods",
    "colors",
    "tags",
] as const;

export type AssetSort =
    | "newest"
    | "oldest"
    | "id-asc"
    | "id-desc"
    | "richest";

export const ASSET_SORTS = [
    "newest",
    "oldest",
    "id-asc",
    "id-desc",
    "richest",
] as const;

export const DEFAULT_ASSET_SORT: AssetSort = "newest";

export const ASSET_SORT_LABELS: Record<AssetSort, string> = {
    newest: "Newest sets",
    oldest: "Oldest sets",
    "id-asc": "Set number ↑",
    "id-desc": "Set number ↓",
    richest: "Most tagged",
};

export type AssetQuery = {
    q: string;
    aesthetics: string[];
    moods: string[];
    colors: string[];
    tags: string[];
    favoritesOnly: boolean;
    sort: AssetSort;
};

export const EMPTY_ASSET_QUERY: AssetQuery = {
    q: "",
    aesthetics: [],
    moods: [],
    colors: [],
    tags: [],
    favoritesOnly: false,
    sort: DEFAULT_ASSET_SORT,
};

/**
 * The subset of `URLSearchParams` these helpers need. Declaring it
 * structurally keeps the module usable from a Node test as well as from
 * the browser.
 */
export type ReadonlyParams = {
    get: (name: string) => string | null;
    getAll?: (name: string) => string[];
};

/**
 * Facet values arrive comma-separated in a single parameter
 * (`?colors=purple,black`) rather than repeated ones, so a hand-written
 * link stays short and easy to read.
 */
function readList(
    params: ReadonlyParams,
    name: string
): string[] {
    const raw = params.get(name);

    if (!raw) {
        return [];
    }

    return [
        ...new Set(
            raw
                .split(",")
                .map((value) => value.trim().toLowerCase())
                .filter(Boolean)
        ),
    ];
}

function readSort(value: string | null): AssetSort {
    return ASSET_SORTS.includes(value as AssetSort)
        ? (value as AssetSort)
        : DEFAULT_ASSET_SORT;
}

export function parseAssetQuery(
    params: ReadonlyParams
): AssetQuery {
    return {
        q: (params.get("q") || "").trim(),
        aesthetics: readList(params, "aesthetics"),
        moods: readList(params, "moods"),
        colors: readList(params, "colors"),
        tags: readList(params, "tags"),
        favoritesOnly: params.get("favorites") === "1",
        sort: readSort(params.get("sort")),
    };
}

export function isAssetQueryEmpty(
    query: AssetQuery
): boolean {
    return (
        !query.q &&
        query.aesthetics.length === 0 &&
        query.moods.length === 0 &&
        query.colors.length === 0 &&
        query.tags.length === 0 &&
        !query.favoritesOnly &&
        query.sort === DEFAULT_ASSET_SORT
    );
}

/**
 * Inverse of `parseAssetQuery`. The default sort is omitted so the
 * common case produces no query string at all and the URL stays clean.
 */
export function buildAssetQuery(
    query: AssetQuery
): string {
    const parts: string[] = [];

    if (query.q) {
        parts.push(`q=${encodeURIComponent(query.q.trim())}`);
    }

    for (const facet of ASSET_FACETS) {
        const values = query[facet];

        if (values.length > 0) {
            parts.push(
                `${facet}=${encodeURIComponent(values.join(","))}`
            );
        }
    }

    if (query.favoritesOnly) {
        parts.push("favorites=1");
    }

    if (query.sort !== DEFAULT_ASSET_SORT) {
        parts.push(`sort=${query.sort}`);
    }

    return parts.join("&");
}

export function toggleFacetValue(
    values: string[],
    value: string
): string[] {
    return values.includes(value)
        ? values.filter((entry) => entry !== value)
        : [...values, value];
}

function matchesText(
    set: AssetCatalogSet,
    query: string
): boolean {
    const haystack = [
        set.id,
        ...set.aesthetics,
        ...set.moods,
        ...set.colors,
        ...(set.tags || []),
    ]
        .join(" ")
        .toLowerCase();

    /*
     * Every word must appear somewhere, so "dark purple" narrows rather
     * than widening. Order-insensitive, which is what a search box feels
     * like when there are only a handful of words.
     */
    return query
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystack.includes(word));
}

export function filterAssetSets(
    sets: AssetCatalogSet[],
    query: AssetQuery,
    favoriteSetIds: string[] | Set<string> = []
): AssetCatalogSet[] {
    const favorites =
        favoriteSetIds instanceof Set
            ? favoriteSetIds
            : new Set(favoriteSetIds);

    return sets.filter((set) => {
        if (query.favoritesOnly && !favorites.has(set.id)) {
            return false;
        }

        if (query.q && !matchesText(set, query.q.toLowerCase())) {
            return false;
        }

        for (const facet of ASSET_FACETS) {
            const wanted = query[facet];

            if (wanted.length === 0) {
                continue;
            }

            const owned = (set[facet] || []).map((value) =>
                value.toLowerCase()
            );

            if (
                !wanted.some((value) =>
                    owned.includes(value.toLowerCase())
                )
            ) {
                return false;
            }
        }

        return true;
    });
}

/**
 * `newest`/`oldest` use the set id because ids are assigned as the
 * library grows - there is no upload timestamp in the catalog.
 */
export function sortAssetSets(
    sets: AssetCatalogSet[],
    sort: AssetSort
): AssetCatalogSet[] {
    const sorted = [...sets];

    const byId = (a: AssetCatalogSet, b: AssetCatalogSet) =>
        Number(a.id) - Number(b.id);

    switch (sort) {
        case "oldest":
            return sorted.sort(byId);

        case "id-asc":
            return sorted.sort(byId);

        case "id-desc":
            return sorted.sort((a, b) => byId(b, a));

        case "richest":
            return sorted.sort(
                (a, b) =>
                    tagCount(b) - tagCount(a) || byId(a, b)
            );

        case "newest":
        default:
            return sorted.sort((a, b) => byId(b, a));
    }
}

function tagCount(set: AssetCatalogSet): number {
    return (
        set.aesthetics.length +
        set.moods.length +
        set.colors.length +
        (set.tags || []).length
    );
}

/**
 * How many sets this one value matches, given the *other* facets already
 * chosen. The facet being counted is narrowed to just this value, so a
 * selected chip and an unselected one are counted the same way and the
 * numbers stay comparable.
 *
 * Chips are never hidden for being zero - a greyed-out 0 tells the user
 * which way to go next, whereas a vanished option makes the filter
 * impossible to explore.
 */
export function facetCounts(
    sets: AssetCatalogSet[],
    query: AssetQuery,
    facet: AssetFacet,
    value: string
): number {
    return filterAssetSets(sets, {
        ...query,
        [facet]: [value],
    }).length;
}
