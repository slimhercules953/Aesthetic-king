/**
 * Which profile sets are premium, and what that means for selection.
 *
 * The flag itself lives in `src/data/assetCatalog.json` — the same
 * file the Studio reads through `studio/lib/assetCatalog.ts` — so
 * tagging a set premium in one place gates it in both products.
 *
 * The Studio and the bot use the flag differently on purpose. Studio
 * shows premium sets to everyone with a crown badge and refuses to
 * open or save them, because browsing is the upsell. The bot has no
 * browse surface: an embed either contains a set or it does not. So
 * the bot filters premium sets out of the pool and only mentions them
 * when they were the *only* match, which is the one moment where
 * "you're locked out" is genuinely useful information rather than
 * noise.
 */

const assetCatalog =
    require("../../data/assetCatalog.json");

/**
 * Thrown when a free user's filters would only have matched premium
 * sets. Distinct from "nothing matches" so callers can upsell instead
 * of telling the user the library is empty.
 */
const PREMIUM_SETS_ONLY_ERROR =
    "Only premium profile sets match the requested filters.";

const PREMIUM_SET_IDS = new Set(
    assetCatalog
        .filter((set) => set.premium === true)
        .map((set) => String(set.id))
);

function isPremiumSetId(setId) {
    return PREMIUM_SET_IDS.has(String(setId));
}

/**
 * True when an error means "every matching set was premium", so a
 * caller can reply with the upsell instead of "nothing exists".
 */
function isPremiumOnlyError(error) {
    return error?.message === PREMIUM_SETS_ONLY_ERROR;
}

function isPremiumCatalogSet(catalogSet) {
    return catalogSet?.premium === true;
}

/**
 * Drops premium sets unless the user has unlocked them.
 *
 * `premiumUnlocked` defaults to false so that a caller which forgets
 * to resolve the entitlement fails closed — it serves the free library
 * rather than the paid one.
 *
 * `isPremium` receives the whole set because the two callers carry the
 * flag differently: catalog entries have `premium` on them, while R2
 * sets only have an id to look up.
 */
function getUsableSets(
    sets,
    premiumUnlocked = false,
    isPremium = (set) => isPremiumSetId(set.id)
) {
    if (premiumUnlocked) {
        return sets;
    }

    return sets.filter(
        (set) => !isPremium(set)
    );
}

module.exports = {
    PREMIUM_SETS_ONLY_ERROR,
    PREMIUM_SET_IDS,

    isPremiumSetId,
    isPremiumCatalogSet,
    isPremiumOnlyError,
    getUsableSets,
};
