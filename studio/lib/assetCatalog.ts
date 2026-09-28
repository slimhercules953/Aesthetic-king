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