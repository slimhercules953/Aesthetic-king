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
     * True when the set belongs to the Premium Assets library.
     * Absent means free, so the flag can be added to the catalog one
     * set at a time.
     */
    premium?: boolean;

    enabled: boolean;
};

const catalog =
    assetCatalog as AssetCatalogSet[];

export function getAssetSets() {
    return catalog
        .filter(
            (set) =>
                set.enabled !== false
        )
        .sort(
            (a, b) =>
                Number(a.id) -
                Number(b.id)
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
    };
}