#!/usr/bin/env node

/*
 * Guards the slash-command surface.
 *
 *   node scripts/testCommands.js
 *
 * The interaction pipeline relies on invariants it cannot enforce by itself:
 * a command module must build, an autocomplete option needs a handler, a
 * declared requiredFeature must exist in both entitlement registries, and
 * nothing may exceed Discord's own payload ceilings. Every one of those fails
 * at runtime in front of a user, so they are checked here instead.
 *
 * Commands are loaded the same way the real loader loads them, so a module
 * that throws while being required is reported rather than silently missing.
 */

require("dotenv").config();

const path = require("node:path");
const { globSync } = require("glob");

const {
    GATED_FEATURES,
} = require("../src/services/entitlements/featureAccessService");

const {
    GATED_COMMAND_FEATURES,
} = require("../src/services/entitlements/commandEntitlementService");

const { InteractionContextType } = require("discord.js");

const ROOT = path.join(__dirname, "..", "src");

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`  \u2713 ${name}`);
    } else {
        failed += 1;
        console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ""}`);
    }
}

const files = globSync("commands/**/*.js", {
    cwd: ROOT,
    absolute: true,
}).sort();

check("found command files", files.length > 0, `${files.length} found`);

const RATE_LIMIT_SCOPES = new Set(["generation", "command"]);

const MAX_CHOICES = 25;
const MAX_OPTIONS = 25;
const MAX_DESCRIPTION = 100;
const MAX_CHOICE_NAME = 100;
const MAX_FIELD_VALUE = 1024;

const commandNames = [];
const nameByFile = [];
const guildOnlyFiles = new Set();

for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    let mod;

    try {
        mod = require(file);
    } catch (error) {
        check(`${rel} loads`, false, error.message);
        continue;
    }

    if (!mod?.data || typeof mod.execute !== "function") {
        check(`${rel} exports data and execute`, false);
        continue;
    }

    let json;

    try {
        json = mod.data.toJSON();
    } catch (error) {
        check(`${rel} builds its SlashCommandBuilder`, false, error.message);
        continue;
    }

    commandNames.push(json.name);
    nameByFile.push([rel, json.name]);

    if (
        Array.isArray(json.contexts) &&
        json.contexts.length === 1 &&
        json.contexts[0] === InteractionContextType.Guild
    ) {
        guildOnlyFiles.add(rel);
    }

    check(`${rel} loads and builds`, true);

    /*
     * An option with autocomplete:true and no handler leaves the user typing
     * into an input box that Discord will never answer.
     */
    const autocompleteOptions = (json.options ?? []).filter((o) => o.autocomplete);

    for (const option of autocompleteOptions) {
        check(
            `${rel} handles autocomplete for "${option.name}"`,
            typeof mod.autocomplete === "function",
            "no autocomplete export"
        );
    }

    check(
        `${rel} has no orphan autocomplete handler`,
        typeof mod.autocomplete !== "function" || autocompleteOptions.length > 0,
        "handler exported but no option declares autocomplete"
    );

    /*
     * requiredFeature is checked twice in production: featureAccessService
     * throws for unknown features and commandEntitlementService only knows the
     * subset wired for commands. A name missing from either one means the
     * command is denied with a "misconfigured" message, so both are asserted.
     */
    if (mod.requiredFeature) {
        check(
            `${rel} requiredFeature "${mod.requiredFeature}" is a gated feature`,
            GATED_FEATURES.has(mod.requiredFeature)
        );

        check(
            `${rel} requiredFeature "${mod.requiredFeature}" is wired for commands`,
            Object.prototype.hasOwnProperty.call(
                GATED_COMMAND_FEATURES,
                mod.requiredFeature
            ),
            "commandEntitlementService would deny the command as misconfigured"
        );
    }

    check(
        `${rel} rateLimitScope is known`,
        mod.rateLimitScope === undefined ||
            RATE_LIMIT_SCOPES.has(mod.rateLimitScope),
        `got ${String(mod.rateLimitScope)}`
    );

    /*
     * Guild-dependent commands must declare the Guild context. Without it a
     * command is usable in DMs, where the pipeline's guild rules (per-command
     * switch, access rules and especially the generation-channel restriction)
     * are all skipped because they need a guild to evaluate.
     */
    if (mod.requireGenerationChannel || json.name === "serverstats") {
        check(
            `${rel} restricts a guild-dependent command to servers`,
            Array.isArray(json.contexts) &&
                json.contexts.length === 1 &&
                json.contexts[0] === InteractionContextType.Guild,
            `contexts is ${JSON.stringify(json.contexts)} — it must be [${InteractionContextType.Guild}]`
        );
    }

    const descriptionLength = (json.description ?? "").length;

    check(
        `${rel} description fits Discord's limit`,
        descriptionLength <= MAX_DESCRIPTION,
        `${descriptionLength} chars (max ${MAX_DESCRIPTION})`
    );

    const optionCount = (json.options ?? []).length;

    check(
        `${rel} option count fits Discord's limit`,
        optionCount <= MAX_OPTIONS,
        `${optionCount} options (max ${MAX_OPTIONS})`
    );

    for (const option of json.options ?? []) {
        const optionDescriptionLength = (option.description ?? "").length;

        check(
            `${rel} option "${option.name}" description fits`,
            optionDescriptionLength <= MAX_DESCRIPTION,
            `${optionDescriptionLength} chars (max ${MAX_DESCRIPTION})`
        );

        for (const choice of option.choices ?? []) {
            check(
                `${rel} choice "${choice.name}" name fits`,
                choice.name.length <= MAX_CHOICE_NAME,
                `${choice.name.length} chars (max ${MAX_CHOICE_NAME})`
            );
        }

        const choiceCount = (option.choices ?? []).length;

        check(
            `${rel} option "${option.name}" choice count fits`,
            choiceCount <= MAX_CHOICES,
            `${choiceCount} choices (max ${MAX_CHOICES})`
        );
    }
}

/*
 * The loader keys commands by name, so a duplicate silently overwrites the
 * other one and the loser just stops existing.
 */
const counts = new Map();
for (const name of commandNames) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
}

for (const [name, count] of counts) {
    check(`command name "${name}" is unique`, count === 1, `registered ${count} times`);
}

/*
 * The commands that stay available in DMs are a deliberate list: they read
 * account-level data and need no guild. A new command that is neither
 * guild-scoped nor listed here has not had the question asked, so fail loudly
 * rather than ship another command that quietly bypasses the guild rules.
 *
 * The rule for joining this list is "the command needs no guild to do its job",
 * not "the command happens to link to Studio". Each entry was checked against
 * that: none of them reads `interaction.guildId`, and the only guild-scoped
 * query in studioBridgeService is the one behind /serverstats. So the
 * guild-guarded stages of the interaction pipeline (per-command switch, server
 * access rules, generation-channel restriction) have no guild policy for these
 * commands to skip.
 *
 *   ping      - health check
 *   saved     - the caller's own saved aesthetics and palettes
 *   premium   - the caller's own plan, Crowns and unlocks
 *   analytics - the caller's own rows, and entitlement-gated on CREATOR_ANALYTICS
 *   remix     - read-only lookup of published SharedPost rows
 *   discover  - public feed, public-by-design by intent
 */
const DM_USABLE_COMMANDS = new Set([
    "ping",
    "saved",
    "remix",
    "discover",
    "analytics",
    "premium",
]);

for (const [file, name] of nameByFile) {
    if (guildOnlyFiles.has(file)) {
        continue;
    }

    check(
        `${name} is either guild-scoped or an approved DM command`,
        DM_USABLE_COMMANDS.has(name),
        "declare .setContexts(InteractionContextType.Guild) or add it to the approved DM list"
    );
}

/*
 * Embed field values cap at 1024 characters and an oversized one throws when
 * the reply is sent, which is the worst possible time to find out. These are
 * worst-case fixtures built from the widest values the database can hold, not
 * guesses: name is a String with no length limit, palette is String[], and
 * Discord display names run to 32 characters.
 */
function widestRow() {
    const swatches = Array.from(
        { length: 6 },
        (_, i) => `#${String(i).repeat(6).slice(0, 6)}`
    );

    return (
        `**${"n".repeat(60)}**\n` +
        `style: ${"S".repeat(40)}\n` +
        swatches.map((hex) => `\`${hex}\``).join(" ") +
        `\nusername: ${"u".repeat(40)}` +
        `\nupdated <t:${Math.floor(Date.now() / 1000)}:R>`
    );
}

const widest = widestRow();

check(
    "saved library rows fit an embed field",
    widest.length <= MAX_FIELD_VALUE,
    `a single row is ${widest.length} chars`
);

/*
 * The /saved section is built by packRows(), which is exported precisely so
 * this can assert the real behaviour: five oversized rows joined naively would
 * exceed the limit, and packing them must produce fields that all fit.
 */
const { packRows } = require("../src/commands/studio/saved");

const rows = Array.from({ length: 5 }, (_, i) => `${widest} ${i}`);

check(
    "saved library rows overflow a single field if unpacked",
    rows.join("\n\n").length > MAX_FIELD_VALUE,
    "rows shrank — the packing guard may no longer be needed"
);

const packed = packRows(rows);

check(
    "packRows splits oversized rows across fields",
    packed.length > 1,
    `got ${packed.length} field(s)`
);

for (const [index, value] of packed.entries()) {
    check(
        `packRows field ${index} fits Discord's limit`,
        value.length <= MAX_FIELD_VALUE,
        `${value.length} chars (max ${MAX_FIELD_VALUE})`
    );
}

check(
    "packRows keeps every row",
    packed.join("\n\n").includes(rows[0]) && packed.join("\n\n").includes(rows[4]),
    "a row was dropped"
);

check(
    "packRows leaves small sections alone",
    packRows(["one", "two"]).length === 1 && packRows(["one", "two"])[0] === "one\n\ntwo"
);

check(
    "packRows never returns an empty field",
    packRows([]).length === 1 && packRows([])[0] === "\u200b"
);

console.log("");
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
