import assetCatalog from "../../src/data/assetCatalog.json";

export type AssetCatalogSet = {
    id: string;

    assets: {
        pfp: string;
        banner: string;
    };

    aesthetics: string[];
    moods: string[];
    colors: string[];

    /**
     * Cross-facet labels such as "cozy" or "dark-palette" - the
     * "when would I reach for this" facet. Derived by
     * `scripts/tagAssetCatalog.js` from the three facets above, so a
     * tag is always a claim about existing metadata rather than about
     * the image itself. Absent means untagged, which keeps the catalog
     * valid before the script has been run.
     */
    tags?: string[];

    /**
     * Tags the artwork's producer asserts about the image itself, which
     * the derived facet cannot know. Merged into `tags` by
     * `scripts/tagAssetCatalog.js` and never overwritten by it, so
     * procedural sets keep their render-style labels through a
     * re-generate.
     */
    curatedTags?: string[];

    /**
     * True when the set belongs to the Premium Assets library.
     * Absent means free, so the flag can be added to the catalog one
     * set at a time.
     */
    premium?: boolean;

    /**
     * Where the artwork came from and what we may do with it.
     *
     * The bot rehosts these images in R2 and renders them into cards
     * people download, which is reproduction, distribution and public
     * display all at once. Doing that with an image nobody recorded a
     * licence for is the single largest legal exposure the asset
     * library has, so provenance is catalog metadata rather than a
     * note in someone's head.
     *
     * Absent means unrecorded, which `scripts/auditAssetLicenses.js`
     * reports. It is deliberately not defaulted to anything safe: an
     * unknown provenance should stay visible, not be laundered into
     * "owned" by a generator run.
     */
    license?: AssetLicense;

    enabled: boolean;
};

export type AssetLicenseKind =
    /** Made by us. No third party has a claim. */
    | "owned"
    /** Produced by our own renderer or an AI model we pay for. */
    | "generated"
    /** Expired copyright or explicitly dedicated to the public. */
    | "public-domain"
    /** CC0, or a free stock site whose licence needs no credit. */
    | "cc0"
    /** Free for commercial use, but credit is legally required. */
    | "cc-by"
    /** Unsplash/Pexels/Pixabay style. Fine as a base layer, not as a
     *  redistributed copy of someone else's stock library. */
    | "stock"
    /** Paid for or commissioned under a written agreement. */
    | "licensed"
    /** We do not know. Treat as unusable until it is resolved. */
    | "unknown";

export type AssetLicense = {
    kind: AssetLicenseKind;

    /** Where it came from: "procedural:mesh-gradient", "met-museum",
     *  "commissioned:@artist", "serpapi" ... */
    source?: string;

    /** Who made it, when we know. */
    author?: string;

    /** The exact string to display when the licence requires credit.
     *  Required for `cc-by`; unused otherwise. */
    attribution?: string;

    /** Whether the licence permits charging for access to it. Unknown
     *  is `null` rather than `false` so an audit can tell the two
     *  apart. */
    commercialUse?: boolean | null;

    url?: string;

    notes?: string;
};

const catalog =
    assetCatalog as AssetCatalogSet[];

/**
 * Orders by numeric id so "2" precedes "10", which a plain string sort
 * gets wrong. Ids that are not numbers - the `gen-001` style the
 * procedural generator emits - fall back to a locale-aware comparison
 * instead of collapsing to `NaN`, which would leave the whole list in
 * whatever order the file happened to be written in.
 */
function compareSetIds(a: string, b: string) {
    const numericA = Number(a);
    const numericB = Number(b);

    if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
        return numericA - numericB;
    }

    return a.localeCompare(b, undefined, { numeric: true });
}

export function getAssetSets() {
    return catalog
        .filter(
            (set) =>
                set.enabled !== false
        )
        .sort(
            (a, b) =>
                compareSetIds(a.id, b.id)
        );
}

export function getAssetSetById(
    id: string
) {
    return (
        getAssetSets().find(
            (set) =>
                set.id === id
        ) ?? null
    );
}

export function isPremiumSet(
    id: string | null | undefined
) {
    if (!id) {
        return false;
    }

    return (
        getAssetSetById(id)?.premium === true
    );
}

/**
 * Licences that let us keep selling access to the set.
 *
 * `unknown` is absent on purpose: a missing provenance is exactly the
 * case an audit is supposed to surface, so it must not be treated as
 * either safe or unsafe by default.
 */
const COMMERCIALLY_SAFE_KINDS = new Set<AssetLicenseKind>([
    "owned",
    "generated",
    "public-domain",
    "cc0",
    "cc-by",
    "stock",
    "licensed",
]);

export function isCommercialUseCleared(
    set: AssetCatalogSet
) {
    const license = set.license;

    if (!license) {
        return false;
    }

    if (
        license.commercialUse === false ||
        !COMMERCIALLY_SAFE_KINDS.has(license.kind)
    ) {
        return false;
    }

    /*
     * A CC-BY set is only actually cleared if the credit string exists,
     * because a licensed-but-uncrédited image is still infringement.
     */
    if (license.kind === "cc-by") {
        return Boolean(license.attribution?.trim());
    }

    return true;
}

/**
 * Sets whose provenance is missing or explicitly unknown. Used by the
 * assets page to warn curators, and by the audit script to fail a
 * release.
 */
export function getUnlicensedAssetSets() {
    return getAssetSets().filter(
        (set) =>
            !set.license ||
            set.license.kind === "unknown" ||
            !isCommercialUseCleared(set)
    );
}

export function countLicensesByKind() {
    const counts = new Map<AssetLicenseKind | "unrecorded", number>();

    for (const set of getAssetSets()) {
        const key = set.license?.kind ?? "unrecorded";
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return counts;
}

/**
 * The sets a user without PREMIUM_ASSETS may be given.
 *
 * Free users still browse the whole library - a locked set they can
 * see is an upsell - but nothing that hands over a set id may pick a
 * premium one for them.
 */
export function getUsableAssetSets(
    premiumUnlocked: boolean
): AssetCatalogSet[] {
    const sets =
        getAssetSets();

    if (premiumUnlocked) {
        return sets;
    }

    return sets.filter(
        (set) => set.premium !== true
    );
}

function uniqueSorted(
    values: string[]
) {
    return [
        ...new Set(values),
    ].sort(
        (a, b) =>
            a.localeCompare(b)
    );
}

export function getAssetCatalogFilters() {
    const sets =
        getAssetSets();

    return {
        aesthetics:
            uniqueSorted(
                sets.flatMap(
                    (set) =>
                        set.aesthetics
                )
            ),

        moods:
            uniqueSorted(
                sets.flatMap(
                    (set) =>
                        set.moods
                )
            ),

        colors:
            uniqueSorted(
                sets.flatMap(
                    (set) =>
                        set.colors
                )
            ),

        tags:
            uniqueSorted(
                sets.flatMap(
                    (set) =>
                        set.tags ?? []
                )
            ),
    };
}