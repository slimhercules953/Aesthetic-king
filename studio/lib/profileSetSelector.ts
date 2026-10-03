import {
    getAssetSets,
} from "./assetCatalog";

type SelectProfileSetInput = {
    aestheticId: string;
    moodId?: string | null;
    colorFilter?: string | null;
    excludeSetId?: string | null;
};

export function selectMatchingProfileSet({
    aestheticId,
    moodId = null,
    colorFilter = null,
    excludeSetId = null,
}: SelectProfileSetInput) {
    const sets =
        getAssetSets();

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
        throw new Error(
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