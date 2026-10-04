/**
 * The aesthetic definitions live in `aesthetics.json` so that the Studio can
 * read them directly. The Studio compiles with `allowJs: false`, so a `.js`
 * module it cannot import would otherwise force a second copy of the palettes
 * to be maintained there - and a Gothic that renders in one set of colours in
 * the bot and another in the web app is the kind of inconsistency nobody
 * notices until a user reports it.
 */
const aesthetics = require("./aesthetics.json");

function getAesthetic(id) {
    if (!id) {
        return null;
    }

    return (
        aesthetics[
        id.toLowerCase().trim()
        ] || null
    );
}

function getAesthetics() {
    return Object.values(aesthetics);
}

function getAestheticChoices() {
    return getAesthetics().map(
        (aesthetic) => ({
            name: aesthetic.name,
            value: aesthetic.id,
        })
    );
}

module.exports = {
    aesthetics,
    getAesthetic,
    getAesthetics,
    getAestheticChoices,
};
