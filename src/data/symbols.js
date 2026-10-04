/**
 * The symbol catalog lives in `symbols.json` so that the Studio can read
 * it directly. The Studio compiles with `allowJs: false`, so a `.js`
 * module it cannot import would otherwise force a second copy of the
 * catalog to be maintained there — and a symbol list that quietly differs
 * between the bot and the web app is a bug nobody notices until someone
 * copies a profile across.
 */
const symbolCatalog = require("./symbols.json");

function getSymbolsForAesthetic(
    aestheticId
) {
    if (!aestheticId) {
        return null;
    }

    return (
        symbolCatalog[
            aestheticId
                .toLowerCase()
                .trim()
        ] || null
    );
}

module.exports = {
    symbolCatalog,
    getSymbolsForAesthetic,
};
