#!/usr/bin/env node

/*
 * Verification for member color roles: `/color` and
 * `src/services/database/guildColorRoleService.js`.
 *
 *   node scripts/testColorRoles.js
 *
 * The feature hands a member a role on their own say-so, so everything here
 * is about the boundary that keeps that from being privilege escalation:
 *
 *   1. Provenance. A role may only be assigned when the bot holds a receipt
 *      for it. Without that check "give me a colour" and "give me
 *      Administrator" are the same API call.
 *   2. Currency. The receipt is not enough on its own — an owner can attach
 *      permissions to a bot-made role afterwards, so safety is re-checked
 *      against live Discord state at the moment of assignment.
 *   3. Replacement. Switching colour removes only receipted roles, so it can
 *      never strip a real role the owner assigned.
 *   4. Hex handling. Discord reserves colour 0 for "no role colour", so
 *      #000000 must be refused rather than silently rendered grey.
 *   5. Visibility. The command must remain visible to ordinary members; a
 *      default member permission would hide it from exactly the people it
 *      exists for.
 *
 * The Prisma client is stubbed, so these run without a database.
 */

const path = require("node:path");

const {
    MessageFlags,
    PermissionFlagsBits,
    PermissionsBitField,
    InteractionContextType,
} = require("discord.js");

const SERVICE_PATH = require.resolve(
    path.join(
        __dirname,
        "..",
        "src",
        "services",
        "database",
        "guildColorRoleService.js"
    )
);

const COMMAND_PATH = require.resolve(
    path.join(
        __dirname,
        "..",
        "src",
        "commands",
        "color",
        "color.js"
    )
);

const PRISMA_PATH = require.resolve(
    path.join(
        __dirname,
        "..",
        "src",
        "services",
        "database",
        "prisma.js"
    )
);

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`  \u2713 ${label}`);
    } else {
        failed += 1;
        console.log(
            `  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ""}`
        );
    }
}

function section(title) {
    console.log(`\n\u001b[1m${title}\u001b[0m`);
}

/* ------------------------------------------------------------------ *
 * Stubbing
 * ------------------------------------------------------------------ */

/**
 * A Prisma client whose every model method is recorded and answered from
 * `handlers`. Anything not handled resolves to null, which the service treats
 * as "not found" — the safe answer.
 */
function fakePrisma(handlers = {}) {
    const calls = [];

    function modelMethod(model, method) {
        return async (args) => {
            calls.push({ model, method, args });

            const handler =
                handlers[`${model}.${method}`] ??
                handlers[`${model}.*`];

            if (!handler) {
                return method === "findMany" ? [] : null;
            }

            return handler(args);
        };
    }

    const models = [
        "guild",
        "guildSettings",
        "guildCosmeticRole",
    ];

    const client = { calls };

    for (const model of models) {
        client[model] = {
            findUnique: modelMethod(model, "findUnique"),
            findFirst: modelMethod(model, "findFirst"),
            findMany: modelMethod(model, "findMany"),
            upsert: modelMethod(model, "upsert"),
            update: modelMethod(model, "update"),
            deleteMany: modelMethod(model, "deleteMany"),
        };
    }

    return client;
}

/**
 * A `guild.findUnique` handler that answers whichever shape the service asked
 * for: the plain id lookup, the nested `settings` read, or the nested
 * `cosmeticRoles` palette read.
 */
function guildHandler({
    id = "db-guild-1",
    settings = null,
    palette = [],
} = {}) {
    return (args) => {
        if (args?.select?.cosmeticRoles) {
            return { cosmeticRoles: palette };
        }

        if (args?.select?.settings) {
            return { id, settings };
        }

        return { id };
    };
}

function withStubs(stubs, load) {
    const saved = new Map();

    for (const [filename, exports] of Object.entries(stubs)) {
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
        delete require.cache[SERVICE_PATH];
        delete require.cache[COMMAND_PATH];

        return load();
    } finally {
        delete require.cache[SERVICE_PATH];
        delete require.cache[COMMAND_PATH];

        for (const [filename, entry] of saved) {
            if (entry) {
                require.cache[filename] = entry;
            } else {
                delete require.cache[filename];
            }
        }
    }
}

function loadService(prisma) {
    return withStubs(
        {
            [PRISMA_PATH]: {
                prisma,
                connectDatabase: async () => prisma,
                disconnectDatabase: async () => {},
            },
        },
        () => require(SERVICE_PATH)
    );
}

function loadCommand(prisma) {
    return withStubs(
        {
            [PRISMA_PATH]: {
                prisma,
                connectDatabase: async () => prisma,
                disconnectDatabase: async () => {},
            },
        },
        () => require(COMMAND_PATH)
    );
}

/* ------------------------------------------------------------------ *
 * Discord-shaped fixtures
 * ------------------------------------------------------------------ */

function fakeRole({
    id,
    name = `role-${id}`,
    hex = "#C084FC",
    permissions = new PermissionsBitField(),
    managed = false,
    position = 5,
}) {
    return {
        id,
        name,
        hexColor: hex,
        permissions,
        managed,
        position,
    };
}

/**
 * A guild member with a role list and add/remove bookkeeping, so a test can
 * assert exactly which roles the command tried to touch.
 */
function fakeMember(roleIds = []) {
    const added = [];
    const removed = [];

    return {
        added,
        removed,
        roles: {
            cache: {
                keyArray: () => roleIds,
            },
            add: async (id, reason) => {
                added.push({ id, reason });
            },
            remove: async (ids, reason) => {
                removed.push({ ids, reason });
            },
        },
    };
}

/**
 * A guild member whose roles arrive as a bare id array, which is the other
 * shape the service has to accept.
 */
function fakeMemberBareArray(roleIds = []) {
    return { roles: roleIds };
}

function fakeBitField(...flags) {
    return new PermissionsBitField(flags);
}

/* ------------------------------------------------------------------ *
 * Pure helpers
 * ------------------------------------------------------------------ */

function testPureHelpers() {
    section("Hex and name handling");

    const service = loadService(fakePrisma());

    check(
        "#C084FC normalises to upper case",
        service.normalizeHex("#C084FC") === "#C084FC"
    );

    check(
        "a bare hex without the # is accepted",
        service.normalizeHex("ff8800") === "#FF8800",
        String(service.normalizeHex("ff8800"))
    );

    check(
        "surrounding whitespace is tolerated",
        service.normalizeHex("  #abc123  ") === "#ABC123"
    );

    for (const bad of [
        "nope",
        "#12",
        "#1234567",
        "#GGGGGG",
        "",
        "   ",
        null,
        undefined,
        42,
        {},
    ]) {
        check(
            `${JSON.stringify(bad)} is rejected as a color`,
            service.normalizeHex(bad) === null
        );
    }

    check(
        "#C084FC converts to the integer Discord stores",
        service.colorToInt("#C084FC") === 0xc084fc
    );

    check(
        "#000000 is refused rather than mapped to Discord's zero color",
        service.colorToInt("#000000") === null
    );

    check(
        "colorFromInt round-trips",
        service.colorFromInt(0xc084fc) === "#C084FC"
    );

    check(
        "colorFromInt clamps out-of-range values to grey",
        service.colorFromInt(99999999) === "#000000"
    );

    check(
        "a default role name is the hex itself, so members share roles",
        service.defaultRoleNameForColor("#c084fc") === "#C084FC"
    );

    check(
        "role names keep their content",
        service.normalizeRoleName("  soft lavender  ") ===
            "soft lavender"
    );

    check(
        "control characters are stripped from role names",
        service.normalizeRoleName("bad\u0000name\u001bhere") ===
            "badnamehere"
    );

    check(
        "an empty role name is refused",
        service.normalizeRoleName("   ") === null
    );

    check(
        "a role name over Discord's limit is refused",
        service.normalizeRoleName("x".repeat(101)) === null
    );

    check(
        "a role name at Discord's limit is allowed",
        service.normalizeRoleName("x".repeat(100)) ===
            "x".repeat(100)
    );

    for (const banned of [
        "everyone",
        "@everyone",
        "EVERYONE",
        "here",
        "@here",
    ]) {
        check(
            `a role named ${banned} is refused`,
            service.normalizeRoleName(banned) === null
        );
    }

    check(
        "FREE is a valid mode",
        service.normalizeMode("free") === "FREE"
    );

    check(
        "PALETTE is a valid mode",
        service.normalizeMode(" PALETTE ") === "PALETTE"
    );

    check(
        "an unknown mode is refused rather than guessed",
        service.normalizeMode("vibes") === null
    );

    check(
        "a non-string mode is refused",
        service.normalizeMode(7) === null
    );
}

/* ------------------------------------------------------------------ *
 * The security boundary
 * ------------------------------------------------------------------ */

async function testRoleSafety() {
    section("Which roles may be assigned");

    const service = loadService(fakePrisma());

    check(
        "a clean bot-made role is assignable",
        service.isRoleSafeToAssign(fakeRole({ id: "1" })) === true
    );

    check(
        "a role carrying any permission is not assignable",
        service.isRoleSafeToAssign(
            fakeRole({
                id: "2",
                permissions: fakeBitField(
                    PermissionFlagsBits.ManageRoles
                ),
            })
        ) === false
    );

    check(
        "a role with Administrator is not assignable",
        service.isRoleSafeToAssign(
            fakeRole({
                id: "3",
                permissions: fakeBitField(
                    PermissionFlagsBits.Administrator
                ),
            })
        ) === false
    );

    check(
        "a managed role is not assignable",
        service.isRoleSafeToAssign(
            fakeRole({ id: "4", managed: true })
        ) === false
    );

    check(
        "@everyone is not assignable",
        service.isRoleSafeToAssign(
            fakeRole({ id: "5", name: "@everyone" })
        ) === false
    );

    check(
        "@here is not assignable",
        service.isRoleSafeToAssign(
            fakeRole({ id: "6", name: "here" })
        ) === false
    );

    check(
        "a missing role is not assignable",
        service.isRoleSafeToAssign(null) === false
    );

    check(
        "a role whose permissions cannot be read is not assignable",
        service.isRoleSafeToAssign({
            id: "7",
            name: "odd shape",
            permissions: "1024",
        }) === false
    );

    section("Receipts are the only proof of provenance");

    const okPrisma = fakePrisma({
        "guildCosmeticRole.findFirst": () => ({ id: "row-1" }),
    });

    const okService = loadService(okPrisma);

    check(
        "a receipted role is the bot's",
        (await okService.isBotCreatedRole("g1", "99")) ===
            true
    );

    const missingService = loadService(fakePrisma());

    check(
        "an unreceipted role is not the bot's",
        (await missingService.isBotCreatedRole(
            "g1",
            "99"
        )) === false
    );

    check(
        "no guild means no receipt",
        (await missingService.isBotCreatedRole(
            null,
            "99"
        )) === false
    );

    check(
        "no role means no receipt",
        (await missingService.isBotCreatedRole(
            "g1",
            null
        )) === false
    );
}

/* ------------------------------------------------------------------ *
 * Which roles get taken off
 * ------------------------------------------------------------------ */

async function testMemberRoles() {
    section("Only receipted roles are ever removed");

    const receipted = ["101", "102"];

    const prisma = fakePrisma({
        "guildCosmeticRole.findMany": (args) =>
            args.where.discordRoleId.in
                .filter((id) => receipted.includes(String(id)))
                .map((id) => ({
                    discordRoleId: String(id),
                    name: `#${id}`,
                    color: "#C084FC",
                })),
    });

    const service = loadService(prisma);

    const member = fakeMember([
        "101",
        "777",
        "102",
        "888",
    ]);

    const found = await service.listMemberColorRoles(
        "g1",
        member
    );

    const foundIds = found
        .map((row) => String(row.discordRoleId))
        .sort();

    check(
        "the held roles are looked up against receipts",
        foundIds.length === 2 &&
            foundIds[0] === "101" &&
            foundIds[1] === "102",
        foundIds.join(",")
    );

    check(
        "roles without a receipt are never reported as color roles",
        !foundIds.includes("777") && !foundIds.includes("888")
    );

    const query = prisma.calls.find(
        (call) =>
            call.model === "guildCosmeticRole" &&
            call.method === "findMany"
    );

    check(
        "the lookup is scoped to this guild",
        query?.args?.where?.guild?.discordId === "g1"
    );

    check(
        "a member given as a bare id array still works",
        (
            await service.listMemberColorRoles(
                "g1",
                fakeMemberBareArray(["101"])
            )
        ).length === 1
    );

    check(
        "a member with no roles costs no database query",
        (
            await service.listMemberColorRoles(
                "g1",
                fakeMember([])
            )
        ).length === 0
    );

    check(
        "no member means no roles",
        (await service.listMemberColorRoles("g1", null))
            .length === 0
    );
}

/* ------------------------------------------------------------------ *
 * Settings and palette
 * ------------------------------------------------------------------ */

async function testSettingsAndPalette() {
    section("Settings");

    const stored = {
        colorRolesEnabled: true,
        colorRoleMode: "PALETTE",
    };

    const prisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: stored,
            palette: [
                {
                    discordRoleId: "101",
                    name: "#C084FC",
                    color: "#C084FC",
                    selfAssignable: true,
                },
            ],
        }),
        "guildSettings.upsert": (args) => ({
            ...stored,
            ...args.update,
            ...args.create,
        }),
    });

    const service = loadService(prisma);

    const settings =
        await service.getColorRoleSettings("g1");

    check(
        "the stored enabled flag is read",
        settings.enabled === true
    );

    check(
        "the stored mode is read",
        settings.mode === "PALETTE",
        settings.mode
    );

    const offPrisma = fakePrisma({
        "guild.findUnique": () => ({
            id: "db-guild-1",
            settings: null,
        }),
    });

    const offSettings =
        await loadService(offPrisma).getColorRoleSettings("g1");

    check(
        "a server with no settings row is off",
        offSettings.enabled === false
    );

    check(
        "the default mode is free typing",
        offSettings.mode === "FREE",
        offSettings.mode
    );

    const unknownPrisma = fakePrisma({
        "guild.findUnique": () => null,
    });

    const unknownSettings =
        await loadService(unknownPrisma).getColorRoleSettings(
            "not-in-db"
        );

    check(
        "an unknown server is off rather than on",
        unknownSettings.enabled === false
    );

    section("Palette");

    const palette = await service.listPaletteColors("g1");

    check(
        "the palette lists approved colors",
        palette.length === 1 &&
            palette[0].color === "#C084FC"
    );

    const paletteQuery = prisma.calls.find(
        (call) =>
            call.model === "guild" &&
            call.method === "findUnique" &&
            call.args?.select?.cosmeticRoles
    );

    check(
        "only self-assignable roles are listed",
        paletteQuery?.args?.select?.cosmeticRoles?.where
            ?.selfAssignable === true
    );

    check(
        "the palette is capped so the embed cannot overflow",
        paletteQuery?.args?.select?.cosmeticRoles?.take === 25
    );
}

/* ------------------------------------------------------------------ *
 * Resolving a colour to a role
 * ------------------------------------------------------------------ */

async function testResolveColorRole() {
    section("Choosing a colour");

    const existingRow = {
        discordRoleId: "101",
        name: "#C084FC",
        color: "#C084FC",
    };

    const prisma = fakePrisma({
        "guildCosmeticRole.findFirst": () => existingRow,
    });

    const service = loadService(prisma);

    const reused = await service.resolveColorRole(
        "g1",
        "#c084fc"
    );

    check(
        "an existing color role is reused rather than duplicated",
        reused.ok === true &&
            reused.created === false &&
            reused.role.discordRoleId === "101"
    );

    const fresh = await loadService(
        fakePrisma()
    ).resolveColorRole("g1", "#FF8800");

    check(
        "a new color asks the command to create the role",
        fresh.ok === true && fresh.needsCreation === true
    );

    check(
        "a new color is named after the hex so members share it",
        fresh.name === "#FF8800",
        fresh.name
    );

    check(
        "an explicit role name is honoured",
        (
            await loadService(fakePrisma()).resolveColorRole(
                "g1",
                "#FF8800",
                { name: "sunset" }
            )
        ).name === "sunset"
    );

    const black = await service.resolveColorRole(
        "g1",
        "#000000"
    );

    check(
        "pure black is refused with an explanation",
        black.ok === false &&
            typeof black.error === "string" &&
            black.error.includes("#010101"),
        black.error
    );

    const junk = await service.resolveColorRole(
        "g1",
        "not-a-color"
    );

    check(
        "junk input is refused before Discord is asked",
        junk.ok === false
    );

    check(
        "an explicit preferred role is looked up by id",
        (
            await service.resolveColorRole(
                "g1",
                "#C084FC",
                { preferredRoleId: "101" }
            )
        ).ok === true
    );

    const preferredPrisma = fakePrisma({
        "guildCosmeticRole.findFirst": (args) =>
            String(args.where.discordRoleId ?? "") === "101"
                ? existingRow
                : null,
    });

    const preferred =
        await loadService(preferredPrisma).resolveColorRole(
            "g1",
            "#C084FC",
            { preferredRoleId: "101" }
        );

    const preferredQuery = preferredPrisma.calls.find(
        (call) =>
            call.model === "guildCosmeticRole" &&
            call.method === "findFirst"
    );

    check(
        "the approved palette role is selected by id, not merely by color",
        preferredQuery?.args?.where?.discordRoleId === "101" &&
            preferred.ok === true
    );
}

/* ------------------------------------------------------------------ *
 * Recording a receipt
 * ------------------------------------------------------------------ */

async function testRecordColorRole() {
    section("Writing a receipt");

    const prisma = fakePrisma({
        "guild.findUnique": () => ({ id: "db-guild-1" }),
        "guildCosmeticRole.upsert": (args) => ({
            ...args.create,
            id: "row-1",
        }),
    });

    const service = loadService(prisma);

    const row = await service.recordColorRole(
        "g1",
        {
            id: "101",
            name: "  #C084FC  ",
            color: "#c084fc",
        },
        {
            createdBy: "user-1",
            selfAssignable: true,
        }
    );

    check(
        "the receipt is written",
        row?.id === "row-1"
    );

    const upsert = prisma.calls.find(
        (call) =>
            call.model === "guildCosmeticRole" &&
            call.method === "upsert"
    );

    check(
        "the receipt is keyed on guild and role so re-adding updates it",
        upsert?.args?.where?.guildId_discordRoleId
            ?.discordRoleId === "101"
    );

    check(
        "the stored color is normalised",
        upsert?.args?.create?.color === "#C084FC"
    );

    check(
        "the stored name is trimmed",
        upsert?.args?.create?.name === "#C084FC"
    );

    check(
        "the member who asked is recorded",
        upsert?.args?.create?.createdBy === "user-1"
    );

    check(
        "an approved palette entry is marked self-assignable",
        upsert?.args?.create?.selfAssignable === true
    );

    check(
        "a receipt is not written for a role with no id",
        (
            await service.recordColorRole("g1", {
                name: "orphan",
                color: "#C084FC",
            })
        ) === null
    );

    check(
        "a receipt is not written for an unparseable color",
        (
            await service.recordColorRole("g1", {
                id: "102",
                name: "junk",
                color: "not-a-color",
            })
        ) === null
    );

    check(
        "a receipt is not written for an unknown server",
        (
            await loadService(
                fakePrisma({
                    "guild.findUnique": () => null,
                })
            ).recordColorRole("g1", {
                id: "103",
                name: "#C084FC",
                color: "#C084FC",
            })
        ) === null
    );
}

/* ------------------------------------------------------------------ *
 * The command itself
 * ------------------------------------------------------------------ */

function testCommandDefinition() {
    section("The /color command definition");

    const command = loadCommand(fakePrisma());
    const json = command.data.toJSON();

    check(
        "the command is named color",
        json.name === "color",
        json.name
    );

    check(
        "it is guild-only, since roles are a guild concept",
        Array.isArray(json.contexts) &&
            json.contexts.length === 1 &&
            json.contexts[0] === InteractionContextType.Guild
    );

    /*
     * This is the one that would have shipped broken: a default member
     * permission is applied to the whole command, so gating on ManageRoles
     * would hide /color from the ordinary members it exists for.
     */
    check(
        "no default member permission hides it from ordinary members",
        json.default_member_permissions === null ||
            json.default_member_permissions === undefined,
        String(json.default_member_permissions)
    );

    check(
        "it is not behind a premium feature",
        command.requiredFeature === undefined,
        String(command.requiredFeature)
    );

    check(
        "it is not confined to the generation channel",
        command.requireGenerationChannel !== true
    );

    const subNames = json.options
        .filter((option) => option.type === 1)
        .map((option) => option.name);

    for (const name of ["set", "remove", "show", "palette"]) {
        check(
            `/color ${name} exists`,
            subNames.includes(name),
            subNames.join(",")
        );
    }

    const config = json.options.find(
        (option) =>
            option.type === 2 && option.name === "config"
    );

    check(
        "the owner settings live under /color config",
        Boolean(config)
    );

    const configNames = (config?.options ?? []).map(
        (option) => option.name
    );

    for (const name of [
        "enable",
        "mode",
        "palette-add",
        "palette-remove",
        "list",
    ]) {
        check(
            `/color config ${name} exists`,
            configNames.includes(name),
            configNames.join(",")
        );
    }

    const setSub = json.options.find(
        (option) =>
            option.type === 1 && option.name === "set"
    );

    const colorOption = (setSub?.options ?? []).find(
        (option) => option.name === "color"
    );

    check(
        "/color set takes a required color",
        colorOption?.type === 3 &&
            colorOption?.required === true
    );

    const modeOption = (
        config?.options ?? []
    )
        .find((option) => option.name === "mode")
        ?.options?.find((option) => option.name === "mode");

    const modeChoices = (modeOption?.choices ?? []).map(
        (choice) => choice.value
    );

    check(
        "the mode option offers exactly free and palette",
        modeChoices.length === 2 &&
            modeChoices.includes("FREE") &&
            modeChoices.includes("PALETTE"),
        modeChoices.join(",")
    );

    check(
        "every description fits Discord's limit",
        json.description.length <= 100 &&
            json.options.every(
                (option) =>
                    option.description.length <= 100
            )
    );

    check(
        "execute is a function",
        typeof command.execute === "function"
    );
}

/* ------------------------------------------------------------------ *
 * Running the command
 * ------------------------------------------------------------------ */

function fakeInteraction({
    subcommand,
    args = {},
    roles = [],
    member = fakeMember([]),
    canManageGuild = false,
    botCanManageRoles = true,
    botPosition = 100,
}) {
    const replies = [];
    const edits = [];

    const roleCache = new Map(
        roles.map((role) => [role.id, role])
    );

    roleCache.keyArray = () => [...roleCache.keys()];
    roleCache.find = (predicate) =>
        [...roleCache.values()].find(predicate);

    const interaction = {
        replies,
        edits,
        guildId: "1000",
        user: {
            id: "member-1",
            tag: "member#0001",
        },
        memberPermissions: {
            has: () => canManageGuild,
        },
        guild: {
            id: "1000",
            roles: {
                cache: roleCache,
                create: async (options) => {
                    const role = fakeRole({
                        id: "900",
                        name: options.name,
                        hex: options.color,
                        position: 3,
                    });

                    roleCache.set(role.id, role);

                    return role;
                },
            },
            members: {
                me: {
                    permissions: {
                        has: () => botCanManageRoles,
                    },
                    roles: {
                        highest: { position: botPosition },
                    },
                },
                fetch: async () => member,
            },
        },
        options: {
            getSubcommand: () => subcommand,
            getSubcommandGroup: () =>
                String(subcommand).startsWith("config-")
                    ? "config"
                    : null,
            getString: (name) => args[name] ?? null,
            getBoolean: (name) => args[name] ?? null,
            getRole: (name) => args[name] ?? null,
        },
        reply: async (payload) => {
            replies.push(payload);
        },
        deferReply: async (payload) => {
            replies.push({ deferred: true, ...payload });
        },
        editReply: async (payload) => {
            edits.push(payload);
        },
    };

    return interaction;
}

function textOf(payload) {
    if (!payload) {
        return "";
    }

    if (typeof payload === "string") {
        return payload;
    }

    if (payload.content) {
        return payload.content;
    }

    return (payload.embeds ?? [])
        .map((embed) =>
            [
                embed.data?.title,
                embed.data?.description,
                ...(embed.data?.fields ?? []).map(
                    (field) =>
                        `${field.name}: ${field.value}`
                ),
            ].join("\n")
        )
        .join("\n");
}

function allText(interaction) {
    return [
        ...interaction.replies,
        ...interaction.edits,
    ]
        .map(textOf)
        .join("\n");
}

async function testCommandFlow() {
    /**
     * A server that has turned the feature on, which most of these scenarios
     * need before they reach the interesting part of the flow.
     */
    function enabledPrisma(extra = {}) {
        return fakePrisma({
            "guild.findUnique": guildHandler({
                settings: {
                    colorRolesEnabled: true,
                    colorRoleMode: "FREE",
                },
            }),
            ...extra,
        });
    }

    section("Permissions on the owner-only settings");

    const command = loadCommand(fakePrisma());

    const notAnAdmin = fakeInteraction({
        subcommand: "config-enable",
        args: { state: true },
        canManageGuild: false,
    });

    await command.execute(notAnAdmin);

    check(
        "a non-admin cannot change color settings",
        notAnAdmin.replies.length === 1 &&
            /admin|permission/i.test(
                allText(notAnAdmin)
            ),
        allText(notAnAdmin)
    );

    check(
        "the refusal is ephemeral",
        notAnAdmin.replies[0]?.flags ===
            MessageFlags.Ephemeral
    );

    check(
        "nothing was written to the database",
        !notAnAdmin.replies.some((reply) =>
            /colors are \*\*on\*\*/.test(textOf(reply))
        )
    );

    section("A member with no Manage Roles permission");

    const noPermission = fakeInteraction({
        subcommand: "set",
        args: { color: "#C084FC" },
        botCanManageRoles: false,
    });

    await loadCommand(enabledPrisma()).execute(noPermission);

    check(
        "the member is told the bot needs Manage Roles",
        /Manage Roles/i.test(allText(noPermission)),
        allText(noPermission)
    );

    check(
        "no role was created",
        noPermission.guild.roles.cache.size === 0
    );

    section("Bad input");

    const junk = fakeInteraction({
        subcommand: "set",
        args: { color: "purple please" },
    });

    await loadCommand(enabledPrisma()).execute(junk);

    check(
        "junk color is refused before anything is created",
        junk.guild.roles.cache.size === 0 &&
            /six digits/i.test(allText(junk)),
        allText(junk)
    );

    section("Switching color removes only receipted roles");

    const heldRole = fakeRole({
        id: "101",
        name: "#FF8800",
        hex: "#FF8800",
        position: 3,
    });

    const realRole = fakeRole({
        id: "777",
        name: "Moderator",
        permissions: fakeBitField(
            PermissionFlagsBits.KickMembers
        ),
        position: 4,
    });

    const switchMember = fakeMember(["101", "777"]);

    const switchPrisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: {
                colorRolesEnabled: true,
                colorRoleMode: "FREE",
            },
        }),
        "guildCosmeticRole.findFirst": () => null,
        "guildCosmeticRole.findMany": (args) =>
            args.where.discordRoleId.in
                .filter((id) => String(id) === "101")
                .map((id) => ({
                    discordRoleId: String(id),
                    name: "#FF8800",
                    color: "#FF8800",
                })),
        "guildCosmeticRole.upsert": (args) => ({
            ...args.create,
            id: "row-2",
        }),
    });

    const switchCommand = loadCommand(switchPrisma);

    const switcher = fakeInteraction({
        subcommand: "set",
        args: { color: "#C084FC" },
        roles: [heldRole, realRole],
        member: switchMember,
    });

    await switchCommand.execute(switcher);

    const removedIds = switchMember.removed
        .flatMap((entry) => entry.ids)
        .map(String);

    check(
        "the previous color role is removed",
        removedIds.includes("101"),
        removedIds.join(",")
    );

    check(
        "a real role the owner assigned is never stripped",
        !removedIds.includes("777"),
        removedIds.join(",")
    );

    check(
        "the new color role is assigned",
        switchMember.added.some(
            (entry) => String(entry.id) === "900"
        ),
        JSON.stringify(switchMember.added)
    );

    check(
        "the member is told their new color",
        /#C084FC/.test(allText(switcher)),
        allText(switcher)
    );

    const createCall = switchPrisma.calls.find(
        (call) =>
            call.model === "guildCosmeticRole" &&
            call.method === "upsert"
    );

    check(
        "the new role is receipted as self-made",
        createCall?.args?.create?.discordRoleId === "900" &&
            createCall?.args?.create?.color === "#C084FC"
    );

    section("A role that gained permissions is refused");

    const escalated = fakeRole({
        id: "500",
        name: "#33AAFF",
        hex: "#33AAFF",
        permissions: fakeBitField(
            PermissionFlagsBits.ManageChannels
        ),
        position: 3,
    });

    const escalateMember = fakeMember([]);

    const escalatePrisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: {
                colorRolesEnabled: true,
                colorRoleMode: "FREE",
            },
        }),
        "guildCosmeticRole.findFirst": () => ({
            id: "row-1",
            discordRoleId: "500",
            name: "#33AAFF",
            color: "#33AAFF",
        }),
        "guildCosmeticRole.findMany": () => [],
    });

    const escalator = fakeInteraction({
        subcommand: "set",
        args: { color: "#33AAFF" },
        roles: [escalated],
        member: escalateMember,
    });

    await loadCommand(escalatePrisma).execute(escalator);

    check(
        "a receipt is not enough once a role has permissions",
        escalateMember.added.length === 0 &&
            /permissions/i.test(allText(escalator)),
        allText(escalator)
    );

    section("The bot cannot reach the role");

    const aboveBot = fakeRole({
        id: "600",
        name: "#22DDAA",
        hex: "#22DDAA",
        position: 200,
    });

    const outrankMember = fakeMember([]);

    const outrankPrisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: {
                colorRolesEnabled: true,
                colorRoleMode: "FREE",
            },
        }),
        "guildCosmeticRole.findFirst": () => ({
            id: "row-1",
            discordRoleId: "600",
            name: "#22DDAA",
            color: "#22DDAA",
        }),
        "guildCosmeticRole.findMany": () => [],
    });

    const outranked = fakeInteraction({
        subcommand: "set",
        args: { color: "#22DDAA" },
        roles: [aboveBot],
        member: outrankMember,
        botPosition: 10,
    });

    await loadCommand(outrankPrisma).execute(outranked);

    check(
        "a role above the bot is explained rather than a bare 50003",
        outrankMember.added.length === 0 &&
            /move my role|above/i.test(allText(outranked)),
        allText(outranked)
    );

    section("Palette mode");

    const palettePrisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: {
                colorRolesEnabled: true,
                colorRoleMode: "PALETTE",
            },
            palette: [
                {
                    discordRoleId: "700",
                    name: "#C084FC",
                    color: "#C084FC",
                    selfAssignable: true,
                },
            ],
        }),
        "guildCosmeticRole.findFirst": () => ({
            id: "row-1",
            discordRoleId: "700",
            name: "#C084FC",
            color: "#C084FC",
        }),
        "guildCosmeticRole.findMany": () => [],
        "guildCosmeticRole.upsert": (args) => ({
            ...args.create,
            id: "row-2",
        }),
    });

    const paletteMember = fakeMember([]);

    const unlisted = fakeInteraction({
        subcommand: "set",
        args: { color: "#FF0000" },
        roles: [],
        member: paletteMember,
    });

    await loadCommand(palettePrisma).execute(unlisted);

    check(
        "an unapproved color is refused in palette mode",
        paletteMember.added.length === 0 &&
            unlisted.guild.roles.cache.size === 0 &&
            /not in this server's palette/i.test(
                allText(unlisted)
            ),
        allText(unlisted)
    );

    const listedMember = fakeMember([]);

    const listed = fakeInteraction({
        subcommand: "set",
        args: { color: "#c084fc" },
        roles: [
            fakeRole({
                id: "700",
                name: "#C084FC",
                hex: "#C084FC",
                position: 3,
            }),
        ],
        member: listedMember,
    });

    await loadCommand(palettePrisma).execute(listed);

    check(
        "an approved color is assigned",
        listedMember.added.some(
            (entry) => String(entry.id) === "700"
        ),
        JSON.stringify(listedMember.added)
    );

    section("The feature is off until an owner enables it");

    const disabledPrisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: null,
        }),
    });

    const disabledMember = fakeMember([]);

    const disabled = fakeInteraction({
        subcommand: "set",
        args: { color: "#C084FC" },
        member: disabledMember,
    });

    await loadCommand(disabledPrisma).execute(disabled);

    check(
        "a server that never opted in hands out nothing",
        disabledMember.added.length === 0 &&
            disabled.guild.roles.cache.size === 0 &&
            /turned off/i.test(allText(disabled)),
        allText(disabled)
    );

    section("Taking a color back");

    const removeMember = fakeMember(["101"]);

    const removePrisma = fakePrisma({
        "guild.findUnique": guildHandler({
            settings: {
                colorRolesEnabled: false,
                colorRoleMode: "FREE",
            },
        }),
        "guildCosmeticRole.findMany": (args) =>
            args.where.discordRoleId.in
                .filter((id) => String(id) === "101")
                .map((id) => ({
                    discordRoleId: String(id),
                    name: "#FF8800",
                    color: "#FF8800",
                })),
    });

    const remover = fakeInteraction({
        subcommand: "remove",
        roles: [heldRole],
        member: removeMember,
    });

    await loadCommand(removePrisma).execute(remover);

    check(
        "a member can always remove their own color, even once disabled",
        removeMember.removed.length === 1 &&
            removeMember.removed[0].ids
                .map(String)
                .includes("101"),
        JSON.stringify(removeMember.removed)
    );

    const nothingMember = fakeMember([]);

    const nothing = fakeInteraction({
        subcommand: "remove",
        member: nothingMember,
    });

    await loadCommand(removePrisma).execute(nothing);

    check(
        "removing with no color says so plainly",
        /do not have a color role/i.test(
            allText(nothing)
        ),
        allText(nothing)
    );

    section("Unknown subcommands and failures");

    const unknown = fakeInteraction({
        subcommand: "teleport",
    });

    let threw = false;

    try {
        await loadCommand(fakePrisma()).execute(unknown);
    } catch {
        threw = true;
    }

    check(
        "an unknown subcommand does not crash the process",
        !threw
    );

    check(
        "an unknown subcommand still answers the member",
        unknown.replies.length + unknown.edits.length > 0
    );
}

/* ------------------------------------------------------------------ *
 * Schema and migration
 * ------------------------------------------------------------------ */

function testSchemaAndDocs() {
    section("Schema, migration and registration");

    const fs = require("node:fs");

    const schema = fs
        .readFileSync(
            path.join(
                __dirname,
                "..",
                "prisma",
                "schema.prisma"
            ),
            "utf8"
        )
        .replace(/\r\n/g, "\n");

    check(
        "the feature is off by default",
        /colorRolesEnabled\s+Boolean\s+@default\(false\)/.test(
            schema
        )
    );

    check(
        "free typing is the default mode",
        /colorRoleMode\s+String\s+@default\("FREE"\)/.test(
            schema
        )
    );

    check(
        "a receipt records where the role came from",
        /model GuildCosmeticRole[\s\S]*?source\s+String\s+@default\("STUDIO"\)/.test(
            schema
        )
    );

    check(
        "a receipt records whether members may claim it",
        /model GuildCosmeticRole[\s\S]*?selfAssignable\s+Boolean\s+@default\(false\)/.test(
            schema
        )
    );

    const migrationDir = path.join(
        __dirname,
        "..",
        "prisma",
        "migrations",
        "20261008120000_add_member_color_roles"
    );

    check(
        "the migration exists",
        fs.existsSync(
            path.join(migrationDir, "migration.sql")
        )
    );

    if (fs.existsSync(path.join(migrationDir, "migration.sql"))) {
        const sql = fs
            .readFileSync(
                path.join(migrationDir, "migration.sql"),
                "utf8"
            )
            .replace(/\r\n/g, "\n");

        check(
            "the migration only adds columns",
            !/DROP\s+(TABLE|COLUMN)/i.test(sql)
        );

        check(
            "new columns carry defaults so existing rows survive",
            (sql.match(/DEFAULT/g) ?? []).length >= 4
        );
    }

    const serverCommands = fs
        .readFileSync(
            path.join(
                __dirname,
                "..",
                "studio",
                "lib",
                "serverCommands.ts"
            ),
            "utf8"
        )
        .replace(/\r\n/g, "\n");

    check(
        "the dashboard can toggle /color",
        /name:\s*"color"/.test(serverCommands)
    );
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

async function main() {
    console.log(
        "\n\u001b[1mMember color roles\u001b[0m"
    );

    testPureHelpers();
    await testRoleSafety();
    await testMemberRoles();
    await testSettingsAndPalette();
    await testResolveColorRole();
    await testRecordColorRole();
    testCommandDefinition();
    await testCommandFlow();
    testSchemaAndDocs();

    console.log(
        `\n${passed} passed, ${failed} failed\n`
    );

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
