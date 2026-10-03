/**
 * Verifies the bot-side premium asset gate.
 *
 *   node scripts/testPremiumGate.js
 *
 * Checks the three things that actually matter: a free user can never
 * be handed a premium set, an unlocked user can, and a free user whose
 * filters only match premium sets gets the upsell error rather than a
 * "the library is empty" error.
 */

const {
    PREMIUM_SET_IDS,
    isPremiumSetId,
    isPremiumOnlyError,
} = require("../src/services/assets/premiumSets");

const {
    getMatchingProfileSets,
    getRandomMatchingProfileSet,
} = require("../src/services/aesthetics/aestheticService");

const {
    getRandomProfileSet,
} = require("../src/services/assets/assetService");

const {
    getActivePlan,
    hasPremiumAssets,
} = require("../src/services/entitlements/featureAccessService");

const logger = require("../src/utils/logger");

let failures = 0;

function check(label, condition, detail = "") {
    if (condition) {
        console.log(`  PASS  ${label}`);
        return;
    }

    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
    console.log("");
    logger.info(`Premium sets in catalog: ${PREMIUM_SET_IDS.size}`);

    /*
     * 1. Catalog filtering.
     */
    console.log("\n[1] catalog filtering");

    const freeSets = await getMatchingProfileSets({
        premiumUnlocked: false,
    });

    const paidSets = await getMatchingProfileSets({
        premiumUnlocked: true,
    });

    const leaked = freeSets.filter((set) =>
        isPremiumSetId(set.id)
    );

    check(
        "free pool contains no premium sets",
        leaked.length === 0,
        leaked.map((set) => set.id).join(", ")
    );

    check(
        "unlocked pool is larger than the free pool",
        paidSets.length > freeSets.length,
        `${paidSets.length} vs ${freeSets.length}`
    );

    check(
        "unlocked pool still contains the premium sets",
        paidSets.some((set) => isPremiumSetId(set.id))
    );

    /*
     * 2. Random picks, repeated, because a single draw proves little.
     */
    console.log("\n[2] random selection");

    let freeLeak = null;

    for (let i = 0; i < 40; i += 1) {
        const set = await getRandomMatchingProfileSet(
            {},
            null
        );

        if (isPremiumSetId(set.id)) {
            freeLeak = set.id;
            break;
        }
    }

    check(
        "40 free random picks never returned a premium set",
        freeLeak === null,
        `leaked set ${freeLeak}`
    );

    let sawPremium = false;

    for (let i = 0; i < 40; i += 1) {
        const set = await getRandomMatchingProfileSet(
            { premiumUnlocked: true },
            null
        );

        if (isPremiumSetId(set.id)) {
            sawPremium = true;
            break;
        }
    }

    check(
        "unlocked random picks do reach premium sets",
        sawPremium
    );

    /*
     * 3. /profile and /theme, which pick straight out of R2.
     */
    console.log("\n[3] R2-backed /profile and /theme");

    let r2Leak = null;

    for (let i = 0; i < 40; i += 1) {
        const set = await getRandomProfileSet(null, false);

        if (isPremiumSetId(set.id)) {
            r2Leak = set.id;
            break;
        }
    }

    check(
        "40 free /profile picks never returned a premium set",
        r2Leak === null,
        `leaked set ${r2Leak}`
    );

    let r2SawPremium = false;

    for (let i = 0; i < 60; i += 1) {
        const set = await getRandomProfileSet(null, true);

        if (isPremiumSetId(set.id)) {
            r2SawPremium = true;
            break;
        }
    }

    check(
        "unlocked /profile picks do reach premium sets",
        r2SawPremium
    );

    /*
     * 4. The upsell error. Any aesthetic whose sets are all premium
     * should raise it for a free user and resolve for an unlocked one.
     */
    console.log("\n[4] premium-only filters");

    /*
     * Some moods and aesthetic+color combinations are made up entirely
     * of premium sets, so a free user hitting one must get the upsell
     * error rather than "there are no such sets".
     */
    const premiumOnlyFilters = [
        { mood: "digital" },
        { mood: "clean" },
        { aestheticId: "anime", color: "red" },
        { aestheticId: "dreamcore", color: "purple" },
    ];

    for (const filters of premiumOnlyFilters) {
        const label = JSON.stringify(filters);

        let code = "resolved";

        try {
            await getRandomMatchingProfileSet({
                ...filters,
                premiumUnlocked: false,
            });
        } catch (error) {
            code = isPremiumOnlyError(error)
                ? "upsell"
                : "plain-empty";
        }

        check(
            `${label} upsells a free user`,
            code === "upsell",
            `got ${code}`
        );

        let unlockedCount = 0;

        try {
            const set = await getRandomMatchingProfileSet({
                ...filters,
                premiumUnlocked: true,
            });

            unlockedCount = set ? 1 : 0;
        } catch {
            unlockedCount = 0;
        }

        check(
            `${label} resolves for an unlocked user`,
            unlockedCount > 0,
            `${unlockedCount} sets`
        );
    }

    /*
     * The opposite case: a filter that matches nothing at all must
     * still report an empty library, not an upsell.
     */
    let emptyCode = "resolved";

    try {
        await getRandomMatchingProfileSet({
            aestheticId: "anime",
            color: "chartreuse",
            premiumUnlocked: false,
        });
    } catch (error) {
        emptyCode = isPremiumOnlyError(error)
            ? "upsell"
            : "plain-empty";
    }

    check(
        "a filter matching nothing reports an empty library",
        emptyCode === "plain-empty",
        `got ${emptyCode}`
    );

    /*
     * 5. Entitlements against the real database. Skipped when the
     * database is unreachable so the asset checks stay useful.
     */
    console.log("\n[5] entitlements");

    try {
        const devId = "567386567300087821";
        const unknownId = "111111111111111111";

        const devPlan = await getActivePlan(devId);
        const unknownPlan = await getActivePlan(unknownId);

        check(
            "grandfathered developer resolves to PREMIUM",
            devPlan === "PREMIUM",
            `got ${devPlan}`
        );

        check(
            "unknown account resolves to FREE",
            unknownPlan === "FREE",
            `got ${unknownPlan}`
        );

        check(
            "hasPremiumAssets agrees for the developer",
            (await hasPremiumAssets(devId)) === true
        );

        check(
            "hasPremiumAssets agrees for an unknown account",
            (await hasPremiumAssets(unknownId)) === false
        );
    } catch (error) {
        console.log(
            `  SKIP  database unavailable — ${error.message}`
        );
    }

    console.log("");

    if (failures > 0) {
        logger.error(`${failures} check(s) failed.`);
        process.exit(1);
    }

    logger.success("Premium gate works.");
}

main().catch((error) => {
    logger.error("Premium gate test failed.", error);
    process.exit(1);
});
