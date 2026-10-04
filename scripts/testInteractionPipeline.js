/**
 * Verifies the bot's interaction pipeline end to end.
 *
 *   node scripts/testInteractionPipeline.js
 *
 * `src/events/interactionCreate.js` is the only place the bot decides whether
 * to run something, so the properties worth testing are the ones that decide
 * it: the order of the checks, that a refusal is always ephemeral, that a
 * refusal happens *before* the work (and therefore before any cost), and that
 * a declarative flag on a command module is actually honoured.
 *
 * The database-backed services are replaced with stubs, but the parts under
 * test are the real ones: the pipeline itself, the entitlement gate, the rate
 * limiter and the embed builders. Stubbing those would only prove the stub
 * works.
 */

const fs = require("fs");
const path = require("path");

const { MessageFlags } = require("discord.js");

const logger = require("../src/utils/logger");

let failures = 0;

function check(label, condition, detail = "") {
    if (condition) {
        console.log(`  PASS  ${label}`);
        return;
    }

    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
}

/**
 * Swaps module exports in the require cache, runs `load`, then restores.
 */
async function withStubs(stubs, load) {
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
        return await load();
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

/**
 * Records every outward-facing call in order, so a test can assert that a
 * refusal was the *first* thing sent rather than merely sent somewhere.
 */
function fakeInteraction({
    kind = "chat",
    commandName = "test",
    customId = null,
    guildId = "guild-1",
    userId = "user-1",
    channelId = "channel-1",
    options = {},
} = {}) {
    const calls = [];

    const interaction = {
        calls,
        kind,
        commandName,
        customId,
        guildId,
        channelId,
        user: { id: userId },
        member: { _roles: ["role-1"] },
        memberPermissions: { has: () => true },
        guild: { name: "Test Guild" },
        replied: false,
        deferred: false,
        options: {
            getString: (name) => options[name] ?? null,
            getInteger: (name) => options[name] ?? null,
        },

        isChatInputCommand: () => kind === "chat",
        isButton: () => kind === "button",
        isAutocomplete: () => kind === "autocomplete",

        deferReply: async (payload = {}) => {
            interaction.deferred = true;
            calls.push({ type: "defer", payload });
        },

        deferUpdate: async () => {
            interaction.deferred = true;
            calls.push({ type: "defer", payload: {} });
        },

        reply: async (payload) => {
            interaction.replied = true;
            calls.push({ type: "reply", payload });
        },

        editReply: async (payload) => {
            calls.push({ type: "edit", payload });
        },

        followUp: async (payload) => {
            calls.push({ type: "followUp", payload });
        },

        update: async (payload) => {
            calls.push({ type: "update", payload });
        },

        respond: async (payload) => {
            calls.push({ type: "respond", payload });
        },
    };

    return interaction;
}

function isEphemeral(payload) {
    return (
        payload?.flags === MessageFlags.Ephemeral ||
        payload?.ephemeral === true
    );
}

function embedTitle(payload) {
    return payload?.embeds?.[0]?.data?.title ?? null;
}

/**
 * A stub whose call list a test can read.
 */
function recorder(impl) {
    const calls = [];

    const fn = (...args) => {
        calls.push(args);
        return impl?.(...args);
    };

    fn.calls = calls;

    return fn;
}

async function main() {
    console.log("");
    logger.info("Interaction pipeline tests");

    /*
     * Shared stub state. `allowed` and `enabled` are flipped per case rather
     * than re-stubbed, so the pipeline module is loaded once and stays loaded.
     */
    const state = {
        allowed: true,
        deniedBy: "DENY_LIST",
        enabled: true,
        generationChannelId: null,
        featureAllowed: true,
        usageEvents: [],
    };

    const stubs = {
        "../src/services/database/guildSettingsService": {
            getGenerationChannelId: async () =>
                state.generationChannelId,
        },

        "../src/services/database/guildCommandService": {
            isGuildCommandEnabled: async () => state.enabled,
        },

        "../src/services/database/guildAccessService": {
            checkGuildAccess: async () =>
                state.allowed
                    ? { allowed: true }
                    : { allowed: false, deniedBy: state.deniedBy },
        },

        "../src/services/database/guildAnalyticsService": {
            logUsageEvent: (event) => {
                state.usageEvents.push(event);
            },
        },

        /*
         * Appearance wraps reply/update methods; the real one needs a live
         * guild settings row, and styling is not what these cases are about.
         */
        "../src/services/database/guildAppearanceService": {
            applyAppearanceToInteraction: () => {},
        },

        "../src/services/entitlements/featureAccessService": {
            resolveFeatureAccess: async () => state.featureAllowed,
        },

        "../src/services/interactions/interactionStateService": {
            getState: (id) =>
                id === "state-1"
                    ? {
                        data: {
                            aestheticId: "cyberpunk",
                            moodId: "calm",
                            packId: "pack-1",
                        },
                    }
                    : null,
            createState: () => "state-1",
            updateState: () => {},
            deleteState: () => {},
        },
    };

    await withStubs(stubs, async () => {
        const pipeline = loadFresh(
            "src/events/interactionCreate.js"
        );

        const {
            resetRateLimits,
            LIMITS,
        } = require("../src/services/interactions/rateLimitService");

        const {
            GATED_COMMAND_FEATURES,
        } = require("../src/services/entitlements/commandEntitlementService");

        function makeClient(command, button) {
            const map = (value) => ({
                get: (key) => (key === value?.name ? value : null),
            });

            return {
                commands: map(command),
                buttons: map(button),
            };
        }

        function commandModule({
            name = "test",
            execute = async () => {},
            requiredFeature = null,
            rateLimitScope = null,
            requireGenerationChannel = false,
            autocomplete = null,
        } = {}) {
            const command = {
                name,
                execute: recorder(execute),
                data: { name },
            };

            if (requiredFeature) {
                command.requiredFeature = requiredFeature;
            }

            if (rateLimitScope) {
                command.rateLimitScope = rateLimitScope;
            }

            if (requireGenerationChannel) {
                command.requireGenerationChannel = true;
            }

            if (autocomplete) {
                command.autocomplete = recorder(autocomplete);
            }

            return command;
        }

        /*
         * 1. Routing.
         */
        console.log("\n[1] routing");

        const noCommand = fakeInteraction({
            commandName: "nonexistent",
        });

        await pipeline.execute(
            makeClient(null, null),
            noCommand
        );

        check(
            "unknown command sends nothing",
            noCommand.calls.length === 0,
            JSON.stringify(noCommand.calls)
        );

        const ok = commandModule();
        const okInteraction = fakeInteraction();

        await pipeline.execute(makeClient(ok, null), okInteraction);

        check(
            "known command executes",
            ok.execute.calls.length === 1
        );

        check(
            "usage event logged for guild command",
            state.usageEvents.length === 1 &&
                state.usageEvents[0].commandName === "test" &&
                state.usageEvents[0].component === "command",
            JSON.stringify(state.usageEvents[0])
        );

        state.usageEvents.length = 0;

        const dm = commandModule();
        const dmInteraction = fakeInteraction({
            guildId: null,
        });

        await pipeline.execute(makeClient(dm, null), dmInteraction);

        check(
            "DM command executes",
            dm.execute.calls.length === 1
        );

        check(
            "DM command logs no guild usage event",
            state.usageEvents.length === 0
        );

        /*
         * 2. Guild switches, in order.
         */
        console.log("\n[2] guild switches");

        state.enabled = false;

        const disabled = commandModule();
        const disabledInteraction = fakeInteraction();

        await pipeline.execute(
            makeClient(disabled, null),
            disabledInteraction
        );

        check(
            "disabled command does not execute",
            disabled.execute.calls.length === 0
        );

        check(
            "disabled reply is ephemeral",
            disabledInteraction.calls.length === 1 &&
                isEphemeral(disabledInteraction.calls[0].payload)
        );

        check(
            "disabled reply names the command",
            embedTitle(disabledInteraction.calls[0].payload) ===
                "Command Disabled"
        );

        state.enabled = true;
        state.allowed = false;

        const denied = commandModule();
        const deniedInteraction = fakeInteraction();

        await pipeline.execute(makeClient(denied, null), deniedInteraction);

        check(
            "access-denied command does not execute",
            denied.execute.calls.length === 0
        );

        check(
            "access-denied reply is ephemeral",
            isEphemeral(deniedInteraction.calls[0].payload)
        );

        const ping = commandModule({ name: "ping" });
        const pingInteraction = fakeInteraction({
            commandName: "ping",
        });

        await pipeline.execute(makeClient(ping, null), pingInteraction);

        check(
            "ping bypasses the guild switches",
            ping.execute.calls.length === 1
        );

        state.allowed = true;

        /*
         * 3. The entitlement gate.
         */
        console.log("\n[3] entitlement gate");

        state.featureAllowed = false;

        const gated = commandModule({
            requiredFeature: "CREATOR_ANALYTICS",
        });

        const gatedInteraction = fakeInteraction();

        await pipeline.execute(makeClient(gated, null), gatedInteraction);

        check(
            "gated command does not execute when locked",
            gated.execute.calls.length === 0
        );

        check(
            "locked reply is ephemeral",
            isEphemeral(gatedInteraction.calls[0].payload)
        );

        check(
            "locked reply is not preceded by a defer",
            gatedInteraction.calls[0].type === "reply",
            gatedInteraction.calls[0].type
        );

        check(
            "locked reply upsells the gated feature",
            String(
                embedTitle(gatedInteraction.calls[0].payload)
            ).includes("Premium")
        );

        state.featureAllowed = true;

        const unlocked = commandModule({
            requiredFeature: "CREATOR_ANALYTICS",
        });

        await pipeline.execute(
            makeClient(unlocked, null),
            fakeInteraction()
        );

        check(
            "gated command executes once unlocked",
            unlocked.execute.calls.length === 1
        );

        /*
         * A typo in `requiredFeature` must deny rather than silently grant, so
         * it is checked here against the real gate module.
         */
        const {
            checkCommandFeatureAccess,
        } = require("../src/services/entitlements/commandEntitlementService");

        const misconfigured = await checkCommandFeatureAccess(
            {
                data: { name: "oops" },
                requiredFeature: "NOT_A_REAL_FEATURE",
            },
            "user-1"
        );

        check(
            "unknown requiredFeature denies the command",
            misconfigured.allowed === false &&
                misconfigured.misconfigured === true
        );

        const ungated = await checkCommandFeatureAccess(
            { data: { name: "plain" } },
            "user-1"
        );

        check(
            "ungated command is allowed",
            ungated.allowed === true
        );

        /*
         * 4. The generation-channel restriction.
         */
        console.log("\n[4] generation channel");

        state.generationChannelId = "gen-channel";

        const wrong = commandModule({
            requireGenerationChannel: true,
        });

        const wrongInteraction = fakeInteraction({
            channelId: "somewhere-else",
        });

        await pipeline.execute(makeClient(wrong, null), wrongInteraction);

        check(
            "wrong-channel command does not execute",
            wrong.execute.calls.length === 0
        );

        check(
            "wrong-channel reply is ephemeral",
            isEphemeral(wrongInteraction.calls[0].payload)
        );

        const right = commandModule({
            requireGenerationChannel: true,
        });

        await pipeline.execute(
            makeClient(right, null),
            fakeInteraction({ channelId: "gen-channel" })
        );

        check(
            "right-channel command executes",
            right.execute.calls.length === 1
        );

        state.generationChannelId = null;

        /*
         * 5. Rate limiting, through the real limiter.
         */
        console.log("\n[5] rate limiting");

        resetRateLimits();

        const genCommand = commandModule({
            name: "gen",
            rateLimitScope: "generation",
        });

        const genClient = makeClient(genCommand, null);

        for (let i = 0; i < LIMITS.generation.maxHits; i += 1) {
            await pipeline.execute(
                genClient,
                fakeInteraction({ commandName: "gen" })
            );
        }

        check(
            "every hit inside the ceiling executes",
            genCommand.execute.calls.length ===
                LIMITS.generation.maxHits,
            String(genCommand.execute.calls.length)
        );

        const over = fakeInteraction({ commandName: "gen" });

        await pipeline.execute(genClient, over);

        check(
            "the hit past the ceiling does not execute",
            genCommand.execute.calls.length ===
                LIMITS.generation.maxHits
        );

        check(
            "rate-limited reply is ephemeral",
            isEphemeral(over.calls[0].payload)
        );

        check(
            "rate-limited reply says slow down",
            embedTitle(over.calls[0].payload) === "Slow Down",
            String(embedTitle(over.calls[0].payload))
        );

        check(
            "rate-limited reply carries a relative timestamp",
            /<t:\d+:R>/.test(
                over.calls[0].payload.embeds[0].data
                    .description ?? ""
            ),
            over.calls[0].payload.embeds[0].data.description
        );

        /*
         * Buckets are per user, so a second member must be unaffected, and per
         * scope, so a cheap command must not drain the generation budget.
         */
        const other = commandModule({
            name: "gen",
            rateLimitScope: "generation",
        });

        const otherInteraction = fakeInteraction({
            commandName: "gen",
            userId: "user-2",
        });

        await pipeline.execute(
            makeClient(other, null),
            otherInteraction
        );

        check(
            "another member is not rate limited",
            other.execute.calls.length === 1
        );

        const cheap = commandModule({ name: "cheap" });

        let cheapAllowed = 0;

        for (let i = 0; i < LIMITS.command.maxHits; i += 1) {
            await pipeline.execute(
                makeClient(cheap, null),
                fakeInteraction({ commandName: "cheap" })
            );

            cheapAllowed = cheap.execute.calls.length;
        }

        check(
            "command scope has its own budget",
            cheapAllowed === LIMITS.command.maxHits,
            String(cheapAllowed)
        );

        /*
         * A request refused for another reason must not burn a hit, which is
         * why the limiter is the last pre-flight check.
         */
        resetRateLimits();

        state.generationChannelId = "gen-channel";

        const scoped = commandModule({
            name: "gen",
            rateLimitScope: "generation",
            requireGenerationChannel: true,
        });

        const scopedClient = makeClient(scoped, null);

        for (let i = 0; i < LIMITS.generation.maxHits + 2; i += 1) {
            await pipeline.execute(
                scopedClient,
                fakeInteraction({
                    commandName: "gen",
                    channelId: "not-the-channel",
                })
            );
        }

        state.generationChannelId = null;

        const afterRefusals = fakeInteraction({
            commandName: "gen",
            channelId: "gen-channel",
        });

        await pipeline.execute(scopedClient, afterRefusals);

        check(
            "refused requests do not consume rate limit budget",
            scoped.execute.calls.length === 1 &&
                afterRefusals.calls.length === 0,
            JSON.stringify(afterRefusals.calls)
        );

        /*
         * 6. Buttons.
         */
        console.log("\n[6] buttons");

        resetRateLimits();

        const unknownButton = fakeInteraction({
            kind: "button",
            customId: "gone:click:abc",
        });

        await pipeline.execute(
            makeClient(null, null),
            unknownButton
        );

        check(
            "unknown button is answered, not ignored",
            unknownButton.calls.length === 1 &&
                unknownButton.calls[0].type === "reply"
        );

        check(
            "unknown button reply is ephemeral",
            isEphemeral(unknownButton.calls[0].payload)
        );

        check(
            "unknown button reply explains it",
            embedTitle(unknownButton.calls[0].payload) ===
                "This Button Is Out of Date"
        );

        const stale = fakeInteraction({
            kind: "button",
            customId: "gone:click:abc",
        });

        stale.replied = true;

        await pipeline.execute(makeClient(null, null), stale);

        check(
            "unknown button on an answered interaction follows up",
            stale.calls.length === 1 &&
                stale.calls[0].type === "followUp"
        );

        const button = {
            name: "bio:reroll",
            customId: "bio:reroll",
            execute: recorder(async () => {}),
        };

        state.usageEvents.length = 0;

        await pipeline.execute(
            makeClient(null, button),
            fakeInteraction({
                kind: "button",
                customId: "bio:reroll:state-1",
            })
        );

        check(
            "known button executes",
            button.execute.calls.length === 1
        );

        check(
            "button usage event carries state ids",
            state.usageEvents.length === 1 &&
                state.usageEvents[0].component === "button" &&
                state.usageEvents[0].commandName === "bio:reroll" &&
                state.usageEvents[0].aestheticId === "cyberpunk" &&
                state.usageEvents[0].packId === "pack-1",
            JSON.stringify(state.usageEvents[0])
        );

        state.allowed = false;

        const blockedButton = {
            name: "bio:reroll",
            execute: recorder(async () => {}),
        };

        await pipeline.execute(
            makeClient(null, blockedButton),
            fakeInteraction({
                kind: "button",
                customId: "bio:reroll:state-1",
            })
        );

        check(
            "restricted member cannot reroll",
            blockedButton.execute.calls.length === 0
        );

        state.allowed = true;

        resetRateLimits();

        const reroll = {
            name: "bio:reroll",
            rateLimitScope: "generation",
            execute: recorder(async () => {}),
        };

        const rerollClient = makeClient(null, reroll);

        for (let i = 0; i < LIMITS.generation.maxHits; i += 1) {
            await pipeline.execute(
                rerollClient,
                fakeInteraction({
                    kind: "button",
                    customId: "bio:reroll:state-1",
                })
            );
        }

        const spamButton = fakeInteraction({
            kind: "button",
            customId: "bio:reroll:state-1",
        });

        await pipeline.execute(rerollClient, spamButton);

        check(
            "reroll button is rate limited",
            reroll.execute.calls.length ===
                LIMITS.generation.maxHits
        );

        const sharedCommand = commandModule({
            name: "gen",
            rateLimitScope: "generation",
        });

        const sharedInteraction = fakeInteraction({
            commandName: "gen",
        });

        await pipeline.execute(
            makeClient(sharedCommand, null),
            sharedInteraction
        );

        check(
            "button spam drains the same bucket as the command",
            sharedCommand.execute.calls.length === 0 &&
                isEphemeral(sharedInteraction.calls[0].payload)
        );

        /*
         * 7. Autocomplete and failures.
         */
        console.log("\n[7] autocomplete and failures");

        const withAc = commandModule({
            name: "ac",
            autocomplete: async () => {},
        });

        const acInteraction = fakeInteraction({
            kind: "autocomplete",
            commandName: "ac",
        });

        await pipeline.execute(
            makeClient(withAc, null),
            acInteraction
        );

        check(
            "autocomplete handler runs",
            withAc.autocomplete.calls.length === 1
        );

        check(
            "autocomplete sends no message",
            acInteraction.calls.length === 0
        );

        const noAc = commandModule({ name: "plain" });
        const noAcInteraction = fakeInteraction({
            kind: "autocomplete",
            commandName: "plain",
        });

        await pipeline.execute(makeClient(noAc, null), noAcInteraction);

        check(
            "autocomplete without a handler is silent",
            noAcInteraction.calls.length === 0
        );

        const throwing = commandModule({
            name: "boom",
            execute: async () => {
                throw new Error("boom");
            },
        });

        const boomInteraction = fakeInteraction({
            commandName: "boom",
        });

        await pipeline.execute(
            makeClient(throwing, null),
            boomInteraction
        );

        check(
            "a throwing command is caught",
            boomInteraction.calls.length === 1 &&
                isEphemeral(boomInteraction.calls[0].payload)
        );

        check(
            "a throwing command reports a generic error",
            embedTitle(boomInteraction.calls[0].payload) ===
                "Something Went Wrong"
        );

        const threwAfterDefer = commandModule({
            name: "boom",
            execute: async (interaction) => {
                await interaction.deferReply();
                throw new Error("boom");
            },
        });

        const deferredBoom = fakeInteraction({
            commandName: "boom",
        });

        await pipeline.execute(
            makeClient(threwAfterDefer, null),
            deferredBoom
        );

        check(
            "an error after deferring follows up",
            deferredBoom.calls[deferredBoom.calls.length - 1]
                .type === "followUp"
        );

        state.usageEvents.length = 0;

        const threwButton = {
            name: "bio:reroll",
            execute: async () => {
                throw new Error("boom");
            },
        };

        await pipeline.execute(
            makeClient(null, threwButton),
            fakeInteraction({
                kind: "button",
                customId: "bio:reroll:state-1",
            })
        );

        check(
            "a failed button logs no usage event",
            state.usageEvents.length === 0
        );

        /*
         * 8. Static checks over the real command and button set.
         *
         * These catch the failure mode the declarative properties create: a
         * command that declares a feature or scope nothing enforces would
         * otherwise look gated while behaving as if it were not.
         */
        console.log("\n[8] declared metadata");

        const { Collection } = require("discord.js");

        const loadCommands = require("../src/loaders/commandLoader");
        const loadButtons = require("../src/loaders/buttonLoader");

        const client = {
            commands: new Collection(),
            buttons: new Collection(),
        };

        loadCommands(client);
        loadButtons(client);

        const badFeatures = [];
        const badScopes = [];

        for (const [name, command] of client.commands) {
            if (
                command.requiredFeature &&
                !Object.prototype.hasOwnProperty.call(
                    GATED_COMMAND_FEATURES,
                    command.requiredFeature
                )
            ) {
                badFeatures.push(
                    `/${name} -> ${command.requiredFeature}`
                );
            }

            if (
                command.rateLimitScope &&
                !LIMITS[command.rateLimitScope]
            ) {
                badScopes.push(`/${name} -> ${command.rateLimitScope}`);
            }
        }

        for (const [id, button] of client.buttons) {
            if (button.rateLimitScope && !LIMITS[button.rateLimitScope]) {
                badScopes.push(`${id} -> ${button.rateLimitScope}`);
            }
        }

        check(
            "every requiredFeature is a registered gated feature",
            badFeatures.length === 0,
            badFeatures.join(", ")
        );

        check(
            "every rateLimitScope is a known limiter scope",
            badScopes.length === 0,
            badScopes.join(", ")
        );

        const bridgeCommands = [
            "discover",
            "saved",
            "remix",
            "analytics",
            "serverstats",
        ];

        const missingBridge = bridgeCommands.filter(
            (name) => !client.commands.has(name)
        );

        check(
            "the Studio bridge commands are all loaded",
            missingBridge.length === 0,
            missingBridge.join(", ")
        );

        check(
            "/analytics declares the creator analytics gate",
            client.commands.get("analytics")?.requiredFeature ===
                "CREATOR_ANALYTICS"
        );

        /*
         * The bridge commands read the database, so a command that defers
         * before it can still answer ephemerally would leak a private library
         * into a public channel. `/saved` and `/analytics` must be ephemeral.
         */
        const savedSource = fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "src",
                "commands",
                "studio",
                "saved.js"
            ),
            "utf8"
        );

        const analyticsSource = fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "src",
                "commands",
                "studio",
                "analytics.js"
            ),
            "utf8"
        );

        check(
            "/saved defers ephemerally",
            savedSource.includes(
                'deferReply({ ephemeral: true })'
            )
        );

        check(
            "/analytics defers ephemerally",
            analyticsSource.includes(
                'deferReply({ ephemeral: true })'
            )
        );

        /*
         * The bridge must not write. A stray create/update/delete in the
         * service would turn a read-only view into a data-integrity risk.
         */
        const bridgeSource = fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "src",
                "services",
                "database",
                "studioBridgeService.js"
            ),
            "utf8"
        );

        const writeCalls = [
            ".create(",
            ".update(",
            ".updateMany(",
            ".delete(",
            ".deleteMany(",
            ".upsert(",
            ".increment(",
            "$transaction",
        ].filter((needle) => bridgeSource.includes(needle));

        check(
            "the bridge service contains no writes",
            writeCalls.length === 0,
            writeCalls.join(", ")
        );

        check(
            "the bridge service uses raw SQL nowhere",
            !bridgeSource.includes("$queryRaw") &&
                !bridgeSource.includes("$executeRaw")
        );

        resetRateLimits();
    });

    console.log("");

    if (failures > 0) {
        logger.error(`${failures} interaction pipeline check(s) failed.`);
        process.exit(1);
    }

    logger.success("All interaction pipeline checks passed.");
}

main().catch((error) => {
    logger.error("Test run crashed.", error);
    process.exit(1);
});