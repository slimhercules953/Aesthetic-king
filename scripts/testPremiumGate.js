/**
 * Verifies the bot-side premium asset gate.
 *
 *   node scripts/testPremiumGate.js
 *
 * Checks the things that actually matter: a free user can never
 * be handed a premium set, an unlocked user can, a free user whose
 * filters only match premium sets gets the upsell error rather than a
 * "the library is empty" error, and that upsell is always ephemeral so
 * nobody else in the channel sees it.
 */

/*
 * Sections 1-4 resolve and download sets from the real asset library, so this
 * suite needs R2 credentials and is skipped when they are absent. The
 * entitlement and ephemerality checks that do not touch R2 stay useful locally,
 * and their behaviour is covered by testInteractionPipeline.js and
 * testPayments.js in CI.
 *
 * The guard runs before the requires below because the asset service builds an
 * S3 client as soon as it is loaded.
 */
require("dotenv").config();

const R2_ENV_VARS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
];

const missingR2 = R2_ENV_VARS.filter((name) => !process.env[name]);

if (missingR2.length > 0) {
    require("../src/utils/logger").warn(
        `Skipping the premium gate suite — unset ${missingR2.join(", ")}.`
    );
    console.log("0 passed, 0 failed (skipped: no R2 credentials)");
    process.exit(0);
}

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

    /*
     * 6. Ephemerality. Discord fixes whether a response is ephemeral when
     * it is sent, so a locked upsell must never travel through a public
     * `editReply`. These checks cover both halves of that rule: the shared
     * payload carries the flag, and no call site edits a locked embed into
     * an already-public message.
     */
    console.log("\n[6] locked replies are ephemeral");

    const {
        buildPremiumAssetsLockedEmbed,
        buildPremiumLockedReply,
    } = require("../src/components/embeds/premiumLocked");

    const { MessageFlags } = require("discord.js");

    const lockedReply = buildPremiumLockedReply(
        buildPremiumAssetsLockedEmbed()
    );

    check(
        "locked reply payload is ephemeral",
        (lockedReply.flags & MessageFlags.Ephemeral) ===
            MessageFlags.Ephemeral,
        `flags ${lockedReply.flags}`
    );

    check(
        "locked reply payload strips components",
        Array.isArray(lockedReply.components) &&
            lockedReply.components.length === 0
    );

    const fs = require("fs");
    const path = require("path");

    const readSource = (relative) =>
        fs.readFileSync(
            path.join(__dirname, "..", relative),
            "utf8"
        );

    /*
     * The entitlement check lives in the shared helpers (`generateProfile`,
     * `prepareTheme`) rather than at each call site, so grepping a command
     * file for it proves nothing. These cases run the real handlers with a
     * locked user and a pick that only matches premium sets, and assert on
     * the calls actually made: the first thing sent must be an ephemeral
     * reply, and nothing may be deferred before it.
     */
    const {
        PREMIUM_SETS_ONLY_ERROR,
    } = require("../src/services/assets/premiumSets");

    function withStubs(stubs, load) {
        const saved = new Map();

        for (const [relative, exports] of Object.entries(stubs)) {
            const filename = require.resolve(relative);

            saved.set(filename, require.cache[filename]);

            require.cache[filename] = {
                id: filename,
                filename,
                loaded: true,
                exports,
                children: [],
                paths: [],
            };
        }

        try {
            return load();
        } finally {
            for (const [filename, entry] of saved) {
                if (entry) {
                    require.cache[filename] = entry;
                } else {
                    delete require.cache[filename];
                }
            }
        }
    }

    function loadFresh(relative) {
        const filename = require.resolve(
            path.join(__dirname, "..", relative)
        );

        delete require.cache[filename];

        return require(filename);
    }

    const stubs = {
        "../src/services/entitlements/featureAccessService": {
            resolvePremiumAssets: async () => false,
        },

        "../src/services/aesthetics/packSetService": {
            pickProfileSet: async () => {
                throw new Error(PREMIUM_SETS_ONLY_ERROR);
            },

            hasFilters: () => false,
        },

        "../src/services/aesthetics/packContextService": {
            withPackOption: (option) => option,
            respondToPackAutocomplete: async () => {},
            buildPackUnavailableReply: () => ({}),
            resolveGenerationContext: async () => ({
                aestheticId: null,
                moodId: null,
                pack: null,
            }),
        },

        "../src/services/interactions/interactionStateService": {
            getState: (stateId) =>
                stateId === "state-1"
                    ? {
                        data: {
                            userId: "user-1",
                            aestheticId: null,
                            moodId: null,
                            packName: null,
                            packColors: [],
                            profileSetId: null,
                        },
                    }
                    : null,
            createState: () => "state-1",
            updateState: () => {},
        },
    };

    function fakeInteraction(customId) {
        const calls = [];

        return {
            calls,
            user: { id: "user-1" },
            guildId: "guild-1",
            customId,
            options: { getString: () => null },
            deferReply: async () => calls.push("defer"),
            deferUpdate: async () => calls.push("defer"),
            reply: async (payload) => calls.push(payload),
            editReply: async () => calls.push("edit"),
            followUp: async () => calls.push("followUp"),
        };
    }

    const lockedCallSites = withStubs(stubs, () => ({
        "profile.js": loadFresh(
            "src/commands/profile/profile.js"
        ).execute,

        "theme.js": loadFresh(
            "src/commands/profile/theme.js"
        ).execute,

        "profileReroll.js": loadFresh(
            "src/components/buttons/profileReroll.js"
        ).execute,

        "themeReroll.js": loadFresh(
            "src/components/buttons/themeReroll.js"
        ).execute,
    }));

    for (const [name, execute] of Object.entries(lockedCallSites)) {
        const interaction = fakeInteraction(
            "profile:reroll:state-1"
        );

        let thrown = null;

        try {
            await execute(interaction);
        } catch (error) {
            thrown = error;
        }

        check(
            `${name} answers a locked pick without throwing`,
            thrown === null,
            thrown?.message
        );

        const first = interaction.calls[0];

        check(
            `${name} replies to a lock before deferring`,
            first && typeof first === "object",
            `first call was ${JSON.stringify(first)}`
        );

        check(
            `${name} replies to a lock ephemerally`,
            first &&
                typeof first === "object" &&
                (first.flags & MessageFlags.Ephemeral) ===
                    MessageFlags.Ephemeral,
            `flags ${first?.flags}`
        );

        /*
         * Guards against a false pass: an expired button session also
         * answers with a single ephemeral reply, so assert the payload is
         * genuinely the upsell embed rather than any other private notice.
         */
        check(
            `${name} answers the lock with the upsell embed`,
            first &&
                typeof first === "object" &&
                Array.isArray(first.embeds) &&
                first.embeds.length > 0 &&
                !first.content,
            JSON.stringify(first?.content ?? null)
        );

        check(
            `${name} locks nothing else into the channel`,
            interaction.calls.length === 1,
            interaction.calls
                .map((call) =>
                    typeof call === "string" ? call : "reply"
                )
                .join(", ")
        );
    }

    /*
     * The helpers themselves must resolve the entitlement before any
     * rendering work, which is also what keeps the slow path out of the
     * three-second window.
     */
    for (const file of [
        "src/components/buttons/profileReroll.js",
        "src/components/buttons/themeReroll.js",
    ]) {
        const source = readSource(file);

        const gateAt = source.indexOf("resolvePremiumAssets(");
        const deferAt = source.search(
            /interaction\.defer(Reply|Update)\(/
        );

        check(
            `${path.basename(file)} resolves entitlement before deferring`,
            gateAt !== -1 && deferAt !== -1 && gateAt < deferAt,
            `gate ${gateAt}, defer ${deferAt}`
        );
    }

    /*
     * `buildAestheticResponse` returns its payload instead of sending it,
     * so it flags the locked case and every caller answers privately.
     */
    const helperSource = readSource(
        "src/components/buttons/aestheticReroll.js"
    );

    check(
        "buildAestheticResponse marks the locked case",
        /return\s*\{\s*locked:\s*true,/.test(helperSource)
    );

    for (const file of [
        "src/components/buttons/aestheticReroll.js",
        "src/commands/aesthetic/aesthetic.js",
    ]) {
        const source = readSource(file);

        check(
            `${path.basename(file)} sends a locked aesthetic result ephemerally`,
            /if\s*\(locked\)\s*\{[\s\S]*?followUp\(\{[\s\S]*?MessageFlags\.Ephemeral/.test(
                source
            )
        );
    }

    for (const file of [
        "src/commands/profile/profile.js",
        "src/commands/profile/theme.js",
        "src/components/buttons/profileReroll.js",
        "src/components/buttons/themeReroll.js",
        "src/components/buttons/aestheticReroll.js",
        "src/commands/aesthetic/aesthetic.js",
    ]) {
        check(
            `${path.basename(file)} never edits a locked embed into a public message`,
            !/editReply\(\s*\{[\s\S]{0,120}?buildPremium(Assets)?LockedEmbed/.test(
                readSource(file)
            )
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
