#!/usr/bin/env node
/**
 * Verification for the Server Studio settings patch
 * (`studio/lib/guildSettings.ts`).
 *
 * The settings form sends `generationChannelId`, `defaultAestheticId`
 * and `defaultMoodId` on every save. The library used to expose one
 * updater per column and the route called them in sequence, keeping only
 * the last result — so saving an aesthetic and a mood together silently
 * discarded the mood. There is no test runner in the Studio and the SQL
 * is hand-written, so this transpiles the real module with the Studio's
 * own esbuild and asserts against the real schema.
 *
 * Asserted behavior:
 *
 *   1. All three columns land in one save (the regression itself).
 *   2. A column the patch omits keeps its stored value.
 *   3. A column the patch sends as null is cleared.
 *   4. An empty patch is refused rather than writing an empty row.
 *   5. The insert branch works when no settings row exists yet.
 *   6. An unknown guild is reported, not silently ignored.
 *
 * The database section is skipped, not failed, when no database is
 * reachable, so this still runs in CI without one.
 *
 * Usage: node scripts/testGuildSettingsPatch.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const esbuild = require(path.join(
    ROOT,
    "studio",
    "node_modules",
    "esbuild"
));

const SETTINGS_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "guildSettings.ts"
);

let passed = 0;
let failed = 0;

function check(label, condition, extra = "") {
    if (condition) {
        passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    } else {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`
        );
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/**
 * Compiles a Studio module to CommonJS and evaluates it. `stubRequire`
 * maps a bare specifier to a fake export; relative specifiers resolve to
 * sibling `.ts` files and load the same way.
 */
function loadModule(modulePath, stubRequire = {}) {
    const result = esbuild.transformSync(
        fs.readFileSync(modulePath, "utf8"),
        {
            loader: "ts",
            format: "cjs",
            target: "node20",
        }
    );

    const module = { exports: {} };

    const req = (specifier) => {
        if (Object.prototype.hasOwnProperty.call(stubRequire, specifier)) {
            return stubRequire[specifier];
        }

        if (specifier.startsWith(".")) {
            const base = path.resolve(
                path.dirname(modulePath),
                specifier
            );

            for (const candidate of [
                `${base}.ts`,
                path.join(base, "index.ts"),
            ]) {
                if (fs.existsSync(candidate)) {
                    return loadModule(candidate, stubRequire);
                }
            }
        }

        throw new Error(
            `testGuildSettingsPatch: cannot resolve "${specifier}" ` +
            `from ${modulePath}`
        );
    };

    new Function("module", "exports", "require", result.code)(
        module,
        module.exports,
        req
    );

    return module.exports;
}

/*
 * Captures the statement and parameters without touching a database, so
 * the shape of the generated SQL can be asserted even offline. A row is
 * returned because the library treats an empty result as "the bot is not
 * in this guild" and raises.
 */
function recordingAdapter() {
    const calls = [];

    return {
        calls,

        query: async (text, values = []) => {
            calls.push({ text, values });

            return {
                rows: [
                    {
                        id: "row-1",
                        guildId: "guild-1",
                        defaultAestheticId: null,
                        defaultMoodId: null,
                        generationChannelId: null,
                        createdAt: new Date(0),
                        updatedAt: new Date(0),
                    },
                ],
            };
        },

        withTransaction: async (work) =>
            work({ query: async () => ({ rows: [] }) }),
    };
}

function sqlSection() {
    section("Generated SQL");

    const adapter = recordingAdapter();

    const lib = loadModule(SETTINGS_PATH, {
        "./apiError": {
            ExpectedError: class ExpectedError extends Error {},
        },
        "./database": adapter,
    });

    check(
        "the library exports a single patch entry point",
        typeof lib.updateGuildSettings === "function" &&
            typeof lib.getGuildSettingsByDiscordId === "function"
    );

    return { lib, adapter };
}

async function databaseSection() {
    section("Settings patch (database)");

    let Client;
    let connectionString;

    try {
        require(path.join(ROOT, "node_modules", "dotenv")).config({
            path: path.join(ROOT, ".env"),
        });

        Client = require(path.join(
            ROOT,
            "studio",
            "node_modules",
            "pg"
        )).Client;

        connectionString =
            process.env.DATABASE_URL ||
            process.env
                .CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
    } catch (error) {
        console.log(
            `  \x1b[33m↷\x1b[0m skipped — pg/dotenv unavailable (${error.message})`
        );
        return;
    }

    if (!connectionString) {
        console.log(
            "  \x1b[33m↷\x1b[0m skipped — no DATABASE_URL in .env"
        );
        return;
    }

    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 8000,
    });

    try {
        await client.connect();
    } catch (error) {
        console.log(
            `  \x1b[33m↷\x1b[0m skipped — database unreachable (${error.message})`
        );
        return;
    }

    const adapter = {
        query: async (text, values = []) =>
            client.query(text, values),
    };

    const lib = loadModule(SETTINGS_PATH, {
        "./apiError": {
            ExpectedError: class ExpectedError extends Error {},
        },
        "./database": adapter,
    });

    const GUILD_DISCORD_ID = "900000000000000098";

    async function cleanup() {
        await client.query(
            `
            DELETE FROM "GuildSettings"
            WHERE "guildId" IN (
                SELECT id FROM "Guild" WHERE "discordId" = $1
            )
            `,
            [GUILD_DISCORD_ID]
        );

        await client.query(
            `DELETE FROM "Guild" WHERE "discordId" = $1`,
            [GUILD_DISCORD_ID]
        );
    }

    try {
        await cleanup();

        const guild = await client.query(
            `
            INSERT INTO "Guild" (
                id, "discordId", name, "createdAt", "updatedAt"
            )
            VALUES (
                'guild-settings-patch-test', $1, 'patch-test',
                NOW(), NOW()
            )
            RETURNING id
            `,
            [GUILD_DISCORD_ID]
        );

        const guildId = guild.rows[0].id;

        check(
            "a guild row exists to hang settings on",
            typeof guildId === "string" && guildId.length > 0
        );

        check(
            "an unknown guild has no settings",
            (
                await lib.getGuildSettingsByDiscordId(
                    "900000000000000097"
                )
            ) === null
        );

        /*
         * The insert branch. The settings row is created here rather than
         * by Prisma, because the first save a server makes is through this
         * exact code path.
         */
        const created = await lib.updateGuildSettings(
            GUILD_DISCORD_ID,
            {
                generationChannelId: "111111111111111111",
                defaultAestheticId: "cottagecore",
                defaultMoodId: "soft",
            }
        );

        /*
         * The regression. Before the fix the route ran three upserts and
         * returned the last one, so `defaultMoodId` came back null here
         * even though the mood had been written moments earlier.
         */
        check(
            "one save writes channel, aesthetic and mood together",
            created.generationChannelId ===
                "111111111111111111" &&
                created.defaultAestheticId === "cottagecore" &&
                created.defaultMoodId === "soft",
            JSON.stringify(created)
        );

        check(
            "the written row reads back the same way",
            (
                await lib.getGuildSettingsByDiscordId(
                    GUILD_DISCORD_ID
                )
            ).defaultMoodId === "soft"
        );

        /*
         * A patch that omits a column must not clear it. The form always
         * sends all three, but the API is public to the Studio and a
         * partial save should stay partial.
         */
        const partial = await lib.updateGuildSettings(
            GUILD_DISCORD_ID,
            {
                defaultMoodId: "ethereal",
            }
        );

        check(
            "patching one column preserves the others",
            partial.defaultMoodId === "ethereal" &&
                partial.defaultAestheticId === "cottagecore" &&
                partial.generationChannelId ===
                    "111111111111111111",
            JSON.stringify(partial)
        );

        const cleared = await lib.updateGuildSettings(
            GUILD_DISCORD_ID,
            {
                defaultAestheticId: null,
                generationChannelId: null,
            }
        );

        check(
            "an explicit null clears a column",
            cleared.defaultAestheticId === null &&
                cleared.generationChannelId === null &&
                cleared.defaultMoodId === "ethereal",
            JSON.stringify(cleared)
        );

        const before = await client.query(
            `
            SELECT COUNT(*)::int AS count
            FROM "GuildSettings"
            WHERE "guildId" = $1
            `,
            [guildId]
        );

        check(
            "repeated saves update the row rather than adding one",
            before.rows[0].count === 1,
            String(before.rows[0].count)
        );

        let refused = false;

        try {
            await lib.updateGuildSettings(
                GUILD_DISCORD_ID,
                {}
            );
        } catch (error) {
            refused = error instanceof Error;
        }

        check(
            "an empty patch is refused",
            refused
        );

        let missing = false;

        try {
            await lib.updateGuildSettings(
                "900000000000000097",
                { defaultMoodId: "soft" }
            );
        } catch (error) {
            missing = error instanceof Error;
        }

        check(
            "a guild that is not installed is reported",
            missing
        );

        await cleanup();

        check(
            "the test guild's settings went with it",
            (
                await lib.getGuildSettingsByDiscordId(
                    GUILD_DISCORD_ID
                )
            ) === null
        );
    } catch (error) {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m database section threw — ${error.message}`
        );

        try {
            await cleanup();
        } catch {
            // Best effort; the row is namespaced to a test guild id.
        }
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function main() {
    const { lib, adapter } = sqlSection();

    /*
     * Asserts the parameter numbering without a database: $1 is always
     * the guild id and each patched column follows in PATCHABLE_FIELDS
     * order, so the generated statement and the values array cannot
     * disagree about which placeholder holds which column.
     */
    await lib.updateGuildSettings("guild-abc", {
        defaultMoodId: "soft",
        generationChannelId: "chan-1",
    });

    const call = adapter.calls[0];

    check(
        "the guild id is always the first parameter",
        call && call.values[0] === "guild-abc",
        JSON.stringify(call && call.values)
    );

    check(
        "only the patched columns appear in the statement",
        call &&
            call.text.includes('"defaultMoodId" = EXCLUDED."defaultMoodId"') &&
            call.text.includes(
                '"generationChannelId" = EXCLUDED."generationChannelId"'
            ) &&
            !call.text.includes(
                '"defaultAestheticId" = EXCLUDED."defaultAestheticId"'
            ),
        call && call.text.replace(/\s+/g, " ").trim()
    );

    check(
        "the parameters line up with the placeholders",
        call &&
            call.values.length === 3 &&
            call.values[1] === "chan-1" &&
            call.values[2] === "soft",
        JSON.stringify(call && call.values)
    );

    check(
        "createdAt and updatedAt are always written",
        call &&
            call.text.includes('"createdAt"') &&
            call.text.includes('"updatedAt" = NOW()')
    );

    await databaseSection();

    console.log(
        `\n${passed} passed, ${failed} failed\n`
    );

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
