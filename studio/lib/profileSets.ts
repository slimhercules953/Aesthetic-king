import {
    getAssetSetById,
    getUsableAssetSets,
    type AssetCatalogSet,
} from "./assetCatalog";

import {
    tryGetProfileAssets,
} from "./assets";

import {
    BUILDER_SET_LIMIT,
    type ProfileSetOption,
} from "./profileSetOptions";

export {
    BUILDER_SET_LIMIT,
    type ProfileSetOption,
};

/**
 * The sets a profile may use, with resolved image URLs.
 *
 * Lives here rather than in the component because the client cannot read
 * the catalog JSON or `R2_PUBLIC_URL`, and because the premium filter has
 * to be applied server-side — a set the user may not have is not offered
 * at all, so there is nothing for the client to bypass.
 */
export function getBuilderSets(
    premiumUnlocked: boolean
): ProfileSetOption[] {
    return getUsableAssetSets(
        premiumUnlocked
    )
        .slice(0, BUILDER_SET_LIMIT)
        .map((set) => {
            const assets =
                tryGetProfileAssets(set.id);

            return {
                id: set.id,

                pfpUrl:
                    assets?.pfpUrl ?? "",

                bannerUrl:
                    assets?.bannerUrl ?? "",

                colors: set.colors,

                premium:
                    set.premium === true,
            };
        })
        .filter(
            (set) =>
                set.pfpUrl !== ""
        );
}

/**
 * The sets "Complete My Profile" may compose from, as catalog rows.
 *
 * `ProfileSetOption` deliberately drops the aesthetics/moods/colours the
 * composer needs, so this returns the catalog shape instead. It shares the
 * premium filter and the "has art" filter with `getBuilderSets` so the two
 * cannot disagree about which sets exist for a given user — otherwise the
 * composer could hand back a set the Builder then refuses to draw.
 *
 * Not capped at `BUILDER_SET_LIMIT`: the grid is a browsable sample, while
 * a composition should be able to reach the whole library. A set outside
 * the grid still renders, because the preview resolves any id through
 * `getBuilderSetById`.
 */
export function getCompletableSets(
    premiumUnlocked: boolean
): AssetCatalogSet[] {
    return getUsableAssetSets(
        premiumUnlocked
    ).filter(
        (set) =>
            Boolean(
                tryGetProfileAssets(set.id)?.pfpUrl
            )
    );
}

/**
 * Resolves one set by id, but only when the user is allowed to use it.
 *
 * `/dashboard/assets/[id]` links straight into the Builder with `?set=`,
 * and the Builder only receives the first `BUILDER_SET_LIMIT` sets. A set
 * further down the catalog would otherwise resolve to nothing and the
 * preview would silently fall back to the palette, so this checks the full
 * usable library and hands back the row the Builder needs to render it.
 */
export function getUsableBuilderSetById(
    setId: string | null,
    premiumUnlocked: boolean
): ProfileSetOption | null {
    if (!setId) {
        return null;
    }

    const usable = getCompletableSets(
        premiumUnlocked
    ).some(
        (set) =>
            set.id === setId
    );

    if (!usable) {
        return null;
    }

    return getBuilderSetById(setId);
}

/**
 * Resolves one set's images, or null when the set is unknown, disabled
 * or R2 is unconfigured.
 *
 * A saved profile keeps its set id even if the set is later retired, so
 * the Builder must tolerate null and fall back to the palette rather than
 * assume the id still resolves.
 */
export function getBuilderSetById(
    setId: string | null
): ProfileSetOption | null {
    if (!setId) {
        return null;
    }

    const assets =
        tryGetProfileAssets(setId);

    if (!assets) {
        return null;
    }

    const catalogSet =
        getAssetSetById(setId);

    return {
        id: setId,

        pfpUrl: assets.pfpUrl,
        bannerUrl: assets.bannerUrl,

        colors: catalogSet?.colors ?? [],

        premium:
            catalogSet?.premium === true,
    };
}
