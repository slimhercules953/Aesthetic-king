/**
 * Resolve the representative mood and color of every catalog set.
 *
 * Saved aesthetics store one mood and one color, and the mood has to be one
 * of the ids in src/data/moods.js (the ids the /aesthetic option list offers),
 * otherwise the Studio detail page shows a tag nobody could have selected.
 *
 * Usage: node scripts/testResolvedSetAttributes.js
 */

const assetCatalog = require("../src/data/assetCatalog.json");

const {
    resolveProfileSetAttributes,
} = require("../src/services/aesthetics/aestheticService");

const { getMood } = require("../src/data/moods");

const failures = [];

function assert(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

function main() {
    const moodCounts = new Map();
    const colorCounts = new Map();

    for (const set of assetCatalog) {
        const { color, mood } =
            resolveProfileSetAttributes(set);

        assert(
            Boolean(color),
            `set ${set.id} resolved no color from ${set.colors}`
        );

        assert(
            Boolean(mood),
            `set ${set.id} resolved no mood from ${set.moods}`
        );

        assert(
            getMood(mood) !== null,
            `set ${set.id} resolved mood "${mood}" which is not a mood id`
        );

        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
        moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
    }

    console.log(`Sets checked: ${assetCatalog.length}`);
    console.log("");
    console.log("Moods:");

    for (const [mood, count] of [...moodCounts.entries()].sort(
        (a, b) => b[1] - a[1]
    )) {
        console.log(`  ${String(mood).padEnd(12)} ${count}`);
    }

    console.log("");
    console.log(`Colors: ${[...colorCounts.keys()].sort().join(", ")}`);

    /*
     * A filter the user actually chose has to survive: the stored value
     * describes the run they asked for, and silently replacing "pink"
     * with the set's leading tag would rewrite history.
     */
    const requested = resolveProfileSetAttributes(assetCatalog[0], {
        color: "Pink",
        mood: "EERIE",
    });

    assert(
        requested.color === "pink",
        `requested color was not preserved: ${requested.color}`
    );

    assert(
        requested.mood === "eerie",
        `requested mood was not preserved: ${requested.mood}`
    );

    const empty = resolveProfileSetAttributes(null);

    assert(
        empty.color === null && empty.mood === null,
        "a missing profile set should resolve to nulls"
    );

    console.log("");

    if (failures.length > 0) {
        console.log(`FAIL ${failures.length} problem(s):`);

        for (const failure of failures) {
            console.log(`  - ${failure}`);
        }

        process.exitCode = 1;
        return;
    }

    console.log(
        "PASS every set resolves to a color and a valid mood id, " +
        "and requested filters win."
    );
}

main();
