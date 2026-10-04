/*
 * `/profile` and `/theme` used to pick from the entire image library, so a
 * Pack (or server default) that narrowed things to, say, `dark` had nowhere
 * to take effect. This keeps the two commands on one picker: the full pool
 * when nothing narrows the request, and the catalog-filtered pool as soon as
 * an aesthetic, mood, or color is known.
 */

const {
    getRandomProfileSet,
} = require("../assets/assetService");

const {
    getRandomMatchingProfileSet,
} = require("./aestheticService");

function hasFilters({
    aestheticId = null,
    moodId = null,
    color = null,
}) {
    return Boolean(aestheticId || moodId || color);
}

/*
 * `excludeSetId` is the set currently on screen so "New Profile" cannot
 * hand back the same image. Both pickers accept it as their second argument.
 */
async function pickProfileSet(
    filters = {},
    excludeSetId = null
) {
    if (!hasFilters(filters)) {
        return getRandomProfileSet(
            excludeSetId,
            filters.premiumUnlocked
        );
    }

    return getRandomMatchingProfileSet(
        filters,
        excludeSetId
    );
}

module.exports = {
    pickProfileSet,
    hasFilters,
};
