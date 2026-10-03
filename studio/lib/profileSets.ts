import {
    getAssetSetById,
    getUsableAssetSets,
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
