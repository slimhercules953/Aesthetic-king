import {
    ExpectedError,
} from "./apiError";

import {
    getUsableAssetSets,
} from "./assetCatalog";

type SelectProfileSetInput = {
    aestheticId: string;
    moodId?: string | null;
    colorFilter?: string | null;
    excludeSetId?: string | null;

    /**
     * Whether the requester holds PREMIUM_ASSETS. The generator hands
     * out the set id it picks, so a caller without the entitlement
     * must not be offered a premium set in the first place.
     */
    premiumUnlocked?: boolean;
};

export function selectMatchingProfileSet({
    aestheticId,
    moodId = null,
    colorFilter = null,
    excludeSetId = null,
    premiumUnlocked = false,
}: SelectProfileSetInput) {
    const sets =
        getUsableAssetSets(
            premiumUnlocked
        );

    let candidates =
        sets.filter(
            (set) =>
                set.aesthetics.includes(
                    aestheticId
                ) &&
                set.id !==
                    excludeSetId
        );

    if (
        candidates.length ===
        0
    ) {
        throw new ExpectedError(
            "No alternative profile sets are available for this aesthetic."
        );
    }

    if (moodId) {
        const moodMatches =
            candidates.filter(
                (set) =>
                    set.moods.includes(
                        moodId
                    )
            );

        if (
            moodMatches.length >
            0
        ) {
            candidates =
                moodMatches;
        }
    }

    if (colorFilter) {
        const colorMatches =
            candidates.filter(
                (set) =>
                    set.colors.includes(
                        colorFilter
                    )
            );

        if (
            colorMatches.length >
            0
        ) {
            candidates =
                colorMatches;
        }
    }

    return candidates[
        Math.floor(
            Math.random() *
                candidates.length
        )
    ];
}