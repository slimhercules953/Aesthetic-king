#!/usr/bin/env node
/**
 * Verification for the cosmetic role feature: `studio/lib/guildRoles.ts`,
 * the roles API route, the role-maker UI and the invite bitfield.
 *
 * What matters here:
 *
 *   1. Escalation. The whole safety argument is that this feature paints
 *      names and grants nothing. So the payload sent to Discord must have
 *      zero permissions, no hoist and no mention, whatever the client asks
 *      for, and the route must forward only a name and a color.
 *   2. The receipt must never contradict Discord. A role that exists on
 *      Discord but fails to record must not be reported as a failure, or the
 *      owner creates a duplicate.
 *   3. Hex handling. Discord stores an integer and reserves 0 for "no color",
 *      so #000000 has to be refused rather than silently turned into a grey
 *      role.
 *
 * Usage: node scripts/testGuildRoles.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const esbuild = require(path.join(ROOT, "studio", "node_modules", "esbuild"));

const LIB_PATH = path.join(ROOT, "studio", "lib", "guildRoles.ts");
const DISCORD_BOT_PATH = path.join(ROOT, "studio", "lib", "discordBot.ts");
const INVITE_PATH = path.join(ROOT, "studio", "lib", "botInvite.ts");
const ROUTE_PATH = path.join(ROOT, "studio", "app", "api", "servers", "[id]", "roles", "route.ts");
const UI_PATH = path.join(ROOT, "studio", "components", "servers", "ServerRoleMaker.tsx");
const PAGE_PATH = path.join(ROOT, "studio", "app", "dashboard", "servers", "[id]", "appearance", "page.tsx");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");
const MIGRATIONS_DIR = path.join(ROOT, "prisma", "migrations");

let passed = 0;
let failed = 0;

function check(label, condition, extra = "") {
    if (condition) {
        passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    } else {
        failed += 1;
        console.error(`  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`);
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function readSource(file) {
    return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Compiles a Studio module to CommonJS and evaluates it, with `stubs`
 * controlling every specifier the module imports.
 */
function loadModule(modulePath, stubRequire = {}) {
    const stubs = { ...stubRequire };
    const cache = new Map();

    function load(target) {
        if (cache.has(target)) {
            return cache.get(target);
        }

        const result = esbuild.transformSync(fs.readFileSync(target, "utf8"), {
            loader: "ts",
            format: "cjs",
            target: "node20",
        });

        const module = { exports: {} };
        cache.set(target, module.exports);

        const req = (specifier) => {
            if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
                return stubs[specifier];
            }

            if (specifier.startsWith(".")) {
                const base = path.resolve(path.dirname(target), specifier);

                for (const candidate of [
                    `${base}.ts`,
                    `${base}.tsx`,
                    path.join(base, "index.ts"),
                ]) {
                    if (fs.existsSync(candidate)) {
                        return load(candidate);
                    }
                }
            }

            throw new Error(`testGuildRoles: cannot resolve "${specifier}" from ${target}`);
        };

        new Function("module", "exports", "require", result.code)(module, module.exports, req);
        cache.set(target, module.exports);

        return module.exports;
    }

    return load(modulePath);
}

/* ------------------------------------------------------------------ *
 * The lib, with its collaborators stubbed
 * ------------------------------------------------------------------ */

class ExpectedError extends Error {
    constructor(message, status = null) {
        super(message);
        this.name = "ExpectedError";
        this.status = status;
    }
}

/** Every payload the lib hands to the Discord layer. */
let sentPayloads = [];
let nextCreateResult = { ok: true, role: { id: "1", position: 0 } };

function makeStubs(dbRows = {}) {
    return {
        "./apiError": { ExpectedError },

        "./database": {
            query: async (text, values) => ({
                rows: dbRows.handler
                    ? dbRows.handler(text, values)
                    : dbRows.rows ?? [],
            }),
        },

        "./discordBot": {
            createGuildRole: async (_guildId, body) => {
                sentPayloads.push(body);
                return nextCreateResult;
            },

            canBotManageRoles: async () =>
                dbRows.canManageRoles === undefined
                    ? true
                    : dbRows.canManageRoles,
        },
    };
}

function loadLib(stubs) {
    return loadModule(LIB_PATH, stubs);
}

function expectThrows(label, fn, fragment) {
    let message = null;
    let threw = false;

    try {
        fn();
    } catch (error) {
        threw = true;
        message = error instanceof Error ? error.message : String(error);
    }

    check(
        label,
        threw && (!fragment || (message || "").includes(fragment)),
        threw ? `threw "${message}"` : "did not throw"
    );
}

async function main() {
    section("Hex handling");

    const lib = loadLib(makeStubs());

    check(
        "#RRGGBB normalises to uppercase",
        lib.normalizeRoleColor("#c084fc") === "#C084FC"
    );

    check(
        "bare RRGGBB is accepted",
        lib.normalizeRoleColor("c084fc") === "#C084FC"
    );

    check(
        "surrounding whitespace is tolerated",
        lib.normalizeRoleColor("  #7C5CFF  ") === "#7C5CFF"
    );

    expectThrows("three-digit hex is rejected", () => lib.normalizeRoleColor("#fff"), "six-digit");
    expectThrows("non-hex characters are rejected", () => lib.normalizeRoleColor("#gggggg"), "six-digit");
    expectThrows("empty color is rejected", () => lib.normalizeRoleColor(""), "color");
    expectThrows("non-string color is rejected", () => lib.normalizeRoleColor(42), "color");

    check(
        "hex converts to the Discord integer",
        lib.roleColorToInt("#00FF00") === 0x00ff00,
        String(lib.roleColorToInt("#00FF00"))
    );

    expectThrows(
        "pure black is refused rather than rendered grey",
        () => lib.roleColorToInt("#000000"),
        "default grey"
    );

    check(
        "#010101 is allowed",
        lib.roleColorToInt("#010101") === 0x010101
    );

    check(
        "int converts back to hex",
        lib.roleColorFromInt(0x00ff00) === "#00FF00",
        lib.roleColorFromInt(0x00ff00)
    );

    check(
        "out-of-range ints fall back to no color",
        lib.roleColorFromInt(-5) === "#000000" && lib.roleColorFromInt(99999999) === "#000000"
    );

    section("Readability");

    const white = lib.roleColorReadability("#FFFFFF");

    check(
        "white is readable on dark Discord",
        white.onDark > 10 && white.readable,
        JSON.stringify(white)
    );

    const dark = lib.roleColorReadability("#0A0A0A");

    check(
        "near-black is readable on light Discord",
        dark.onLight > 10,
        JSON.stringify(dark)
    );

    /*
     * A mid grey sits between the two backgrounds, so it fails against both.
     * This is the case the warning exists for.
     */
    const muddy = lib.roleColorReadability("#808080");

    check(
        "a color that fails both themes is flagged",
        muddy.readable === false,
        JSON.stringify(muddy)
    );

    expectThrows(
        "readability validates its input too",
        () => lib.roleColorReadability("nonsense"),
        "six-digit"
    );

    section("Create path: nothing but paint reaches Discord");

    sentPayloads = [];
    nextCreateResult = { ok: true, role: { id: "999", position: 0 } };

    const created = await lib.createCosmeticRole("123456789012345678", {
        name: "  aesthetic  ",
        color: "#c084fc",
    });

    check("a valid role is created", created.ok === true, JSON.stringify(created));

    check(
        "the name is trimmed",
        created.ok && created.role.name === "aesthetic",
        JSON.stringify(created)
    );

    check(
        "the color is normalised in the result",
        created.ok && created.role.color === "#C084FC",
        JSON.stringify(created)
    );

    check(
        "exactly one payload reached the Discord layer",
        sentPayloads.length === 1,
        String(sentPayloads.length)
    );

    /*
     * The lib's contract with discordBot is only { name, color }; hoist,
     * mention and permissions are fixed inside discordBot.createGuildRole,
     * which is asserted below from source.
     */
    check(
        "only name and color are forwarded",
        JSON.stringify(Object.keys(sentPayloads[0]).sort()) === JSON.stringify(["color", "name"]),
        JSON.stringify(sentPayloads[0])
    );

    sentPayloads = [];

    const black = await lib.createCosmeticRole("123456789012345678", {
        name: "void",
        color: "#000000",
    });

    check(
        "black is refused before Discord is called",
        black.ok === false && sentPayloads.length === 0 && /default grey/.test(black.error),
        JSON.stringify({ black, sentPayloads })
    );

    sentPayloads = [];

    const noName = await lib.createCosmeticRole("123456789012345678", {
        name: "   ",
        color: "#7C5CFF",
    });

    check(
        "a blank name is refused before Discord is called",
        noName.ok === false && sentPayloads.length === 0 && /name/i.test(noName.error),
        JSON.stringify({ noName, sentPayloads })
    );

    for (const bad of ["@everyone", "@here", "Everyone", "here"]) {
        sentPayloads = [];

        const result = await lib.createCosmeticRole("123456789012345678", {
            name: bad,
            color: "#7C5CFF",
        });

        check(
            `"${bad}" cannot be a role name`,
            result.ok === false && sentPayloads.length === 0,
            JSON.stringify({ result, sentPayloads })
        );
    }

    sentPayloads = [];

    const tooLong = await lib.createCosmeticRole("123456789012345678", {
        name: "x".repeat(101),
        color: "#7C5CFF",
    });

    check(
        "an over-long name is refused",
        tooLong.ok === false && sentPayloads.length === 0 && /100 characters/.test(tooLong.error),
        JSON.stringify(tooLong)
    );

    sentPayloads = [];

    const controlChars = await lib.createCosmeticRole("123456789012345678", {
        name: "a\u0000b\u001bc",
        color: "#7C5CFF",
    });

    check(
        "control characters are stripped, not rejected",
        controlChars.ok === true && controlChars.role.name === "abc",
        JSON.stringify(controlChars)
    );

    sentPayloads = [];

    const nonString = await lib.createCosmeticRole("123456789012345678", {
        name: { toString: () => "sneaky" },
        color: "#7C5CFF",
    });

    check(
        "a non-string name is refused",
        nonString.ok === false && sentPayloads.length === 0,
        JSON.stringify(nonString)
    );

    nextCreateResult = { ok: false, error: "Discord says no" };

    const rejected = await lib.createCosmeticRole("123456789012345678", {
        name: "fine",
        color: "#7C5CFF",
    });

    check(
        "a Discord rejection is passed through verbatim",
        rejected.ok === false && rejected.error === "Discord says no",
        JSON.stringify(rejected)
    );

    nextCreateResult = { ok: true, role: { id: "1", position: 0 } };

    section("Tool status");

    const unavailable = loadLib(makeStubs({ canManageRoles: null }));
    const status = await unavailable.getRoleToolStatus("123456789012345678");

    check(
        "an unreadable guild reports canRead false with canManageRoles null",
        status.canRead === false && status.canManageRoles === null,
        JSON.stringify(status)
    );

    const noRolesPerm = loadLib(makeStubs({ canManageRoles: false }));
    const status2 = await noRolesPerm.getRoleToolStatus("123456789012345678");

    check(
        "a readable guild without Manage Roles says so",
        status2.canRead === true && status2.canManageRoles === false,
        JSON.stringify(status2)
    );

    section("Receipt table");

    let captured = null;

    const dbLib = loadLib(
        makeStubs({
            handler: (text, values) => {
                captured = { text, values };

                return [
                    {
                        id: "row1",
                        discordRoleId: "999",
                        name: "aesthetic",
                        color: "#C084FC",
                        createdAt: new Date("2026-10-07T12:00:00.000Z"),
                    },
                ];
            },
        })
    );

    const recorded = await dbLib.recordCosmeticRole(
        "123456789012345678",
        { id: "999", name: "aesthetic", color: "#C084FC" },
        "111122223333444455"
    );

    check(
        "the receipt is returned with an ISO timestamp",
        recorded && recorded.createdAt === "2026-10-07T12:00:00.000Z",
        JSON.stringify(recorded)
    );

    check(
        "the receipt is looked up by Discord guild id",
        /WHERE g\."discordId" = \$1/.test(captured.text) &&
            captured.values[0] === "123456789012345678",
        JSON.stringify(captured.values)
    );

    check(
        "a replayed insert updates rather than duplicating",
        /ON CONFLICT \("guildId", "discordRoleId"\)/i.test(captured.text)
    );

    check(
        "the guild row is resolved by subquery, not a hardcoded id",
        /INSERT INTO "GuildCosmeticRole"[\s\S]*?SELECT[\s\S]*?FROM "Guild" g/i.test(captured.text)
    );

    const listed = await dbLib.listCosmeticRoles("123456789012345678");

    check(
        "the list is scoped to the guild",
        listed.length === 1 && listed[0].discordRoleId === "999" &&
            /WHERE g\."discordId" = \$1/.test(captured.text),
        JSON.stringify(listed)
    );

    for (const [label, call] of [
        ["an empty guild id is refused on read", () => dbLib.listCosmeticRoles("")],
        [
            "an empty guild id is refused on write",
            () =>
                dbLib.recordCosmeticRole(
                    "",
                    { id: "1", name: "a", color: "#FFFFFF" },
                    null
                ),
        ],
    ]) {
        let rejectedRead = false;

        try {
            await call();
        } catch (error) {
            rejectedRead = error instanceof ExpectedError;
        }

        check(label, rejectedRead);
    }

    sentPayloads = [];
    let deleteValues = null;

    const deleteLib = loadLib(
        makeStubs({
            handler: (text, values) => {
                deleteValues = { text, values };
                return [{ id: "row1" }];
            },
        })
    );

    sentPayloads = [];

    const forgot = await deleteLib.forgetCosmeticRole("123456789012345678", "row1");

    check(
        "forgetting a receipt deletes by guild and record",
        forgot === true &&
            /DELETE FROM "GuildCosmeticRole"/i.test(deleteValues.text) &&
            /g\."discordId" = \$1/.test(deleteValues.text) &&
            /r\.id = \$2/.test(deleteValues.text),
        JSON.stringify(deleteValues)
    );

    check(
        "forgetting never issues a Discord call",
        sentPayloads.length === 0,
        JSON.stringify(sentPayloads)
    );

    for (const badId of ["", "a".repeat(41), "row 1", "row/1", "row;DROP"]) {
        let rejected2 = false;

        try {
            await deleteLib.forgetCosmeticRole("123456789012345678", badId);
        } catch (error) {
            rejected2 = error instanceof ExpectedError;
        }

        check(
            `a malformed record id "${badId || "(empty)"}" is refused`,
            rejected2
        );
    }

    section("Discord payload (source)");

    const discordSource = readSource(DISCORD_BOT_PATH);

    const createFn =
        discordSource.match(
            /export async function createGuildRole[\s\S]*?\n}\n/
        )?.[0] ?? "";

    check(
        "createGuildRole exists",
        createFn.length > 0
    );

    check(
        "the created role has zero permissions",
        /permissions:\s*"0"/.test(createFn),
        createFn.slice(0, 200)
    );

    check(
        "the created role is not hoisted",
        /hoist:\s*false/.test(createFn)
    );

    check(
        "the created role is not mentionable",
        /mentionable:\s*false/.test(createFn)
    );

    check(
        "the role endpoint is the guild roles collection",
        /\/guilds\/\$\{guildId\}\/roles/.test(createFn) &&
            /method:\s*"POST"/.test(createFn)
    );

    check(
        "the cached guild snapshot is dropped after creating a role",
        /invalidateGuildSnapshot\(guildId\)/.test(createFn)
    );

    check(
        "hitting the role limit gets its own message",
        /30005/.test(createFn) && /role limit/i.test(createFn)
    );

    check(
        "a missing permission explains the fix",
        /Manage Roles/.test(createFn)
    );

    const manageFn =
        discordSource.match(
            /export async function canBotManageRoles[\s\S]*?\n}\n/
        )?.[0] ?? "";

    check(
        "Manage Roles is tested as bit 28",
        /BigInt\(1\)\s*<<\s*BigInt\(28\)/.test(discordSource) && manageFn.length > 0,
        manageFn.slice(0, 120)
    );

    check(
        "the permission check unions the bot's own roles",
        /permissions\s*\|=\s*BigInt\(role\.permissions\)/.test(manageFn)
    );

    check(
        "an unreadable guild is reported as unknown, not denied",
        /return null;/.test(manageFn)
    );

    section("Invite bitfield");

    const inviteSource = readSource(INVITE_PATH);
    const bitfield = inviteSource.match(
        /const BOT_PERMISSIONS =([\s\S]*?);/
    )?.[1];

    check("BOT_PERMISSIONS is still declared", typeof bitfield === "string");

    const total = (bitfield ?? "")
        .split("+")
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n))
        .reduce((sum, n) => sum + n, 0);

    check(
        "Manage Roles (268435456) is requested",
        total === 64 + 1024 + 2048 + 16384 + 32768 + 65536 + 262144 + 1048576 + 2097152 + 67108864 + 268435456,
        String(total)
    );

    const DANGEROUS_BITS = {
        KICK_MEMBERS: 2,
        BAN_MEMBERS: 4,
        ADMINISTRATOR: 8,
        MANAGE_CHANNELS: 16,
        MANAGE_GUILD: 32,
        MENTION_EVERYONE: 131072,
        MANAGE_NICKNAMES: 8388608,
    };

    for (const [name, bit] of Object.entries(DANGEROUS_BITS)) {
        check(
            `${name.toLowerCase().replace(/_/g, " ")} is still not requested`,
            (total & bit) === 0,
            String(total)
        );
    }

    check(
        "the invite still pins the target guild",
        /disable_guild_select/.test(inviteSource)
    );

    section("API route");

    const routeSource = readSource(ROUTE_PATH);

    check(
        "every method guards guild access",
        (routeSource.match(/guardGuildAccessWithSession\(/g) ?? []).length >= 3,
        String((routeSource.match(/guardGuildAccessWithSession\(/g) ?? []).length)
    );

    check(
        "the creator is taken from the verified session",
        /denied\.session\.discordId/.test(routeSource) &&
            !/body\?\.(createdBy|discordId)/.test(routeSource)
    );

    check(
        "only name and color are read from the body",
        /name:\s*body\?\.name/.test(routeSource) &&
            /color:\s*body\?\.color/.test(routeSource) &&
            !/body\?\.permissions/.test(routeSource) &&
            !/body\?\.hoist/.test(routeSource) &&
            !/body\?\.mentionable/.test(routeSource)
    );

    check(
        "the bot must be installed before creating",
        /isGuildInstalled\(id\)/.test(routeSource)
    );

    check(
        "a failed receipt is logged, not returned",
        /created in \$\{id\} but not recorded/.test(routeSource) &&
            /recordCosmeticRole\([\s\S]*?\)\.catch\(\(\) => null\)/.test(routeSource)
    );

    check(
        "the receipt list degrades to empty rather than failing the page",
        /listCosmeticRoles\([\s\S]*?\)\.catch\(\(\) => \[\]\)/.test(routeSource)
    );

    check(
        "errors go through handleRouteError",
        (routeSource.match(/handleRouteError\(/g) ?? []).length >= 3
    );

    check(
        "DELETE removes a receipt, not a Discord role",
        !/\/roles\/\$\{/.test(routeSource) &&
            /searchParams\.get\(\s*"record"\s*\)/.test(routeSource)
    );

    section("Role maker UI");

    const uiSource = readSource(UI_PATH);

    check(
        "the UI previews the name on both Discord themes",
        /#313338/.test(uiSource) && /#F2F3F5/.test(uiSource)
    );

    check(
        "the UI warns when a color is unreadable",
        /readable/.test(uiSource) && /hard\s+to read|hard to read/i.test(uiSource.replace(/\s+/g, " "))
    );

    /*
     * The UI is allowed to *talk* about permissions ("the role grants no
     * permissions"); what must not happen is the request carrying them.
     */
    const createBody =
        uiSource.match(
            /body:\s*JSON\.stringify\(\{[\s\S]*?\}\)/
        )?.[0] ?? "";

    check(
        "the create request sends only name and color",
        JSON.stringify(
            (createBody.match(/\b(name|color|hoist|mentionable|permissions|guildId)\b/g) ?? [])
                .filter((value, index, all) => all.indexOf(value) === index)
                .sort()
        ) === JSON.stringify(["color", "name"]),
        createBody
    );

    check(
        "the create button waits on the request",
        /disabled=\{[\s\S]*?busy/.test(uiSource)
    );

    check(
        "the UI explains that the role grants nothing",
        /grants no permissions/i.test(uiSource.replace(/\s+/g, " "))
    );

    check(
        "the UI explains the readability warning",
        /hard to read against both Discord themes/i.test(
            uiSource.replace(/\s+/g, " ")
        )
    );

    check(
        "the UI warns with the same contrast bar as the server",
        /MIN_CONTRAST = 4\.5/.test(uiSource) &&
            /onDark >= MIN_CONTRAST/.test(uiSource) &&
            /onLight >= MIN_CONTRAST/.test(uiSource)
    );

    /*
     * The maker must not open on a colour it is about to warn about, and a
     * swatch that shows the warning the moment you click it reads as broken.
     */
    const presetList =
        uiSource.match(/const PRESET_COLORS = \[([\s\S]*?)\];/)?.[1] ?? "";

    const presets = presetList.match(/#[0-9A-Fa-f]{6}/g) ?? [];

    check("the UI offers preset colors", presets.length > 0, presetList.trim());

    check(
        "the default color is one of the presets",
        presets.includes(
            uiSource.match(/const DEFAULT_COLOR = "(#[0-9A-Fa-f]{6})"/)?.[1] ?? ""
        )
    );

    for (const preset of presets) {
        const ratio = lib.roleColorReadability(preset);

        check(
            `preset ${preset} is readable`,
            ratio.readable,
            JSON.stringify(ratio)
        );
    }

    check(
        "a missing Manage Roles permission offers the invite link",
        /canManageRoles === false/.test(uiSource) && /inviteUrl/.test(uiSource)
    );

    check(
        "removing an entry is labelled as not deleting the role",
        /does not delete the role/i.test(uiSource.replace(/\s+/g, " "))
    );

    check(
        "the component is a client component",
        uiSource.startsWith('"use client"')
    );

    section("Mounting and schema");

    const pageSource = readSource(PAGE_PATH);

    check(
        "the role maker is mounted on the Appearance tab",
        /ServerRoleMaker/.test(pageSource) &&
            /<ServerRoleMaker[\s\S]*?guildId=\{guild\.id\}/.test(pageSource)
    );

    const schemaSource = readSource(SCHEMA_PATH);

    check(
        "the receipt model exists",
        /model GuildCosmeticRole \{/.test(schemaSource)
    );

    check(
        "the receipt is unique per guild and role",
        /@@unique\(\[guildId, discordRoleId\]\)/.test(schemaSource)
    );

    check(
        "the receipt cascades with the guild",
        /model GuildCosmeticRole \{[\s\S]*?onDelete: Cascade/.test(schemaSource)
    );

    const migrationFile = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((name) => /guild_cosmetic_roles/.test(name))
        .map((name) => path.join(MIGRATIONS_DIR, name, "migration.sql"))
        .find((file) => fs.existsSync(file));

    check(
        "a migration for the table exists",
        Boolean(migrationFile),
        migrationFile ?? "none"
    );

    if (migrationFile) {
        const migration = readSource(migrationFile);

        check(
            "the migration creates the table",
            /CREATE TABLE "GuildCosmeticRole"/.test(migration)
        );

        check(
            "the migration creates the unique index",
            /CREATE UNIQUE INDEX "GuildCosmeticRole_guildId_discordRoleId_key"/.test(migration)
        );

        check(
            "the migration adds the cascading foreign key",
            /FOREIGN KEY \("guildId"\) REFERENCES "Guild"\("id"\) ON DELETE CASCADE/.test(migration)
        );
    }

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
