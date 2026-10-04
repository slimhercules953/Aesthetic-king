#!/usr/bin/env node
/**
 * Phase 4 verification for the Profile Builder.
 *
 * `studio/lib/profileModel.ts` holds every rule the Builder depends on:
 * what a saveable profile is, how a palette is cleaned, and what the
 * preview falls back to. The Studio has no test runner and the preview
 * cannot be rendered here (the bot's canvas renderer does not run on the
 * Workers runtime, which is why the preview is DOM/CSS), so this script
 * transpiles the real modules with the Studio's own esbuild and asserts
 * against them. The checks therefore run against shipped code rather
 * than a JavaScript copy that could drift.
 *
 * `profileModel.ts` is pure and loads as-is. The final section is
 * database-backed and runs the real `profiles.ts` SQL — the Studio has no
 * Prisma client, so nothing else checks that hand-written SQL against the
 * real schema. It is skipped (not failed) when no database is reachable.
 *
 * Asserted behavior:
 *
 *   1. Text clamping counts code points, so emoji survive.
 *   2. Hex / palette / symbol / discriminator normalization.
 *   3. parseProfileInput truncates noise and rejects the unrenderable.
 *   4. Contrast picks a readable text color on any background.
 *   5. derivePreviewState has a fallback for every empty field.
 *   6. checkCompleteness reports what is missing.
 *   7. The free version limit is enforced at the right boundary.
 *   8. Against the database: create/read/update/activate/delete round-trip,
 *      and only one profile can be active at a time.
 *
 * Usage: node scripts/testProfileBuilder.js
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

const MODEL_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "profileModel.ts"
);

const PROFILES_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "profiles.ts"
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

function eq(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compiles a Studio module to CommonJS and evaluates it.
 *
 * `stubRequire` maps a bare specifier to a fake export, for modules that
 * would otherwise open a database connection on import. Any other
 * relative specifier is resolved to a sibling `.ts` file and loaded the
 * same way, so a module graph can be pulled in without a bundler.
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

        return require(specifier);
    };

    // eslint-disable-next-line no-new-func
    new Function("module", "exports", "require", result.code)(
        module,
        module.exports,
        req
    );

    return module.exports;
}

function draft(overrides = {}) {
    return {
        name: "Test",
        profileSetId: null,

        username: null,
        discriminator: null,
        pronouns: null,

        bio: null,
        status: null,

        symbols: [],
        palette: [],

        accentColor: null,

        ...overrides,
    };
}

async function main() {
    const model = loadModule(MODEL_PATH);

    const {
        clampText,
        normalizeHex,
        normalizePalette,
        normalizeSymbols,
        joinSymbols,
        normalizeDiscriminator,
        parseProfileInput,
        relativeLuminance,
        mixHex,
        contrastTextColor,
        initialsOf,
        derivePreviewState,
        checkCompleteness,
        canSaveDraft,
        emptyDraft,
        PROFILE_LIMITS,
        MIN_PALETTE_COLORS,
        FREE_PROFILE_VERSIONS,
    } = model;

    /* ------------------------------------------------------------------ */
    section("Text clamping");

    check(
        "non-strings clamp to null",
        clampText(null, 10) === null &&
            clampText(undefined, 10) === null &&
            clampText(42, 10) === null &&
            clampText({ a: 1 }, 10) === null
    );

    check(
        "blank and whitespace-only clamp to null",
        clampText("", 10) === null &&
            clampText("   ", 10) === null &&
            clampText("\n\t ", 10) === null
    );

    check(
        "surrounding whitespace is trimmed",
        clampText("  hello  ", 10) === "hello"
    );

    check(
        "text within the limit is untouched",
        clampText("abcdef", 10) === "abcdef"
    );

    check(
        "over-long text is truncated to the limit",
        clampText("abcdefghij", 4) === "abcd"
    );

    /*
     * The reason clampText counts code points: a single astral emoji is
     * two UTF-16 units, and `.slice()` would leave half of a surrogate
     * pair behind. Symbols and status text are exactly where users put
     * emoji, so this is the bug that would actually ship.
     */
    check(
        "emoji count as one character, not two",
        [...clampText("👑👑👑👑", 3)].length === 3,
        `got ${[...clampText("👑👑👑👑", 3)].length}`
    );

    check(
        "clamping emoji does not split a surrogate pair",
        !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(
            clampText("👑👑👑👑", 3)
        )
    );

    check(
        "bio limit matches Discord",
        PROFILE_LIMITS.bio === 190 &&
            PROFILE_LIMITS.username === 32 &&
            PROFILE_LIMITS.status === 128
    );

    /* ------------------------------------------------------------------ */
    section("Color normalization");

    check(
        "lowercase hex is uppercased",
        normalizeHex("#7c3aed") === "#7C3AED"
    );

    check(
        "a missing hash is added",
        normalizeHex("7c3aed") === "#7C3AED"
    );

    check(
        "shorthand hex is rejected rather than expanded",
        normalizeHex("#abc") === null
    );

    check(
        "garbage and non-strings are rejected",
        normalizeHex("not-a-color") === null &&
            normalizeHex("#12345g") === null &&
            normalizeHex("") === null &&
            normalizeHex(99) === null &&
            normalizeHex(null) === null
    );

    check(
        "palette keeps order (primary → accent reads left to right)",
        eq(
            normalizePalette(["#000000", "#FFFFFF", "#FF0000"]),
            ["#000000", "#FFFFFF", "#FF0000"]
        )
    );

    check(
        "palette de-duplicates case-insensitively",
        eq(
            normalizePalette(["#abcdef", "#ABCDEF", "#abcdef"]),
            ["#ABCDEF"]
        )
    );

    check(
        "palette drops invalid entries and keeps the valid ones",
        eq(
            normalizePalette(["#000000", "nope", null, "#FFFFFF"]),
            ["#000000", "#FFFFFF"]
        )
    );

    check(
        "palette is capped at the limit",
        normalizePalette(
            Array.from({ length: 20 }, (_, i) =>
                `#${i.toString(16).padStart(2, "0")}${i
                    .toString(16)
                    .padStart(2, "0")}${i
                    .toString(16)
                    .padStart(2, "0")}`.toUpperCase()
            )
        ).length === PROFILE_LIMITS.palette
    );

    check(
        "a non-array palette is empty, not an error",
        eq(normalizePalette("nope"), []) &&
            eq(normalizePalette(null), []) &&
            eq(normalizePalette({}), [])
    );

    /* ------------------------------------------------------------------ */
    section("Symbols and discriminator");

    check(
        "symbols keep internal spacing (a copied cluster stays whole)",
        eq(normalizeSymbols(["♡ ⋆ ˚"]), ["♡ ⋆ ˚"])
    );

    check(
        "symbols are trimmed, de-duplicated and capped",
        eq(normalizeSymbols([" ♡ ", "♡", "", "  "]), ["♡"]) &&
            normalizeSymbols(
                Array.from({ length: 30 }, (_, i) => `s${i}`)
            ).length === PROFILE_LIMITS.symbols
    );

    check(
        "non-string symbols are dropped",
        eq(normalizeSymbols(["♡", 5, null, {}]), ["♡"])
    );

    check(
        "joinSymbols joins with single spaces",
        joinSymbols(["♡", "⋆"]) === "♡ ⋆"
    );

    check(
        "discriminator keeps the last four digits",
        normalizeDiscriminator("1234") === "1234" &&
            normalizeDiscriminator("#1234") === "1234" &&
            normalizeDiscriminator("00001234") === "1234"
    );

    check(
        "a short discriminator is not zero-padded",
        normalizeDiscriminator("7") === "7"
    );

    check(
        "a discriminator with no digits is null",
        normalizeDiscriminator("abcd") === null &&
            normalizeDiscriminator("") === null &&
            normalizeDiscriminator(null) === null
    );

    /* ------------------------------------------------------------------ */
    section("parseProfileInput");

    for (const bad of [null, undefined, "hi", 42, [1, 2]]) {
        check(
            `rejects a non-object body (${JSON.stringify(bad) ?? "undefined"})`,
            parseProfileInput(bad).ok === false
        );
    }

    check(
        "rejects a palette with one color",
        (() => {
            const result = parseProfileInput({
                palette: ["#000000"],
            });

            return (
                result.ok === false &&
                result.errors.some((e) =>
                    e.includes(MIN_PALETTE_COLORS.toString())
                )
            );
        })()
    );

    check(
        "rejects a profile with neither a set nor colors",
        (() => {
            const result = parseProfileInput({ name: "x" });

            return (
                result.ok === false &&
                result.errors.length === 1
            );
        })()
    );

    check(
        "a set alone is enough to save",
        parseProfileInput({ profileSetId: "12" }).ok === true
    );

    check(
        "a palette alone is enough to save",
        parseProfileInput({
            palette: ["#000000", "#FFFFFF"],
        }).ok === true
    );

    check(
        "a missing name falls back instead of failing",
        (() => {
            const result = parseProfileInput(
                { palette: ["#000000", "#FFFFFF"] },
                "My profile"
            );

            return (
                result.ok === true && result.value.name === "My profile"
            );
        })()
    );

    check(
        "over-long fields are truncated, not rejected",
        (() => {
            const result = parseProfileInput({
                profileSetId: "1",
                username: "u".repeat(100),
                bio: "b".repeat(500),
                status: "s".repeat(500),
            });

            return (
                result.ok === true &&
                result.value.username.length ===
                    PROFILE_LIMITS.username &&
                result.value.bio.length === PROFILE_LIMITS.bio &&
                result.value.status.length === PROFILE_LIMITS.status
            );
        })()
    );

    check(
        "unknown keys are dropped rather than rejected",
        (() => {
            const result = parseProfileInput({
                profileSetId: "1",
                evil: true,
                isAdmin: true,
            });

            return (
                result.ok === true &&
                !("evil" in result.value) &&
                !("isAdmin" in result.value)
            );
        })()
    );

    check(
        "an invalid accent color becomes null, not an error",
        (() => {
            const result = parseProfileInput({
                profileSetId: "1",
                accentColor: "crimson",
            });

            return (
                result.ok === true &&
                result.value.accentColor === null
            );
        })()
    );

    check(
        "a blank profileSetId is stored as null, not \"\"",
        (() => {
            const result = parseProfileInput({
                profileSetId: "   ",
                palette: ["#000000", "#FFFFFF"],
            });

            return (
                result.ok === true &&
                result.value.profileSetId === null
            );
        })()
    );

    /* ------------------------------------------------------------------ */
    section("Contrast");

    check(
        "white text on a dark card",
        contrastTextColor("#111214") === "#FFFFFF"
    );

    check(
        "dark text on a light card",
        contrastTextColor("#F5F5F7") === "#0B0B0D"
    );

    /*
     * The specific failure a luminance threshold has: #808080 sits at the
     * midpoint, and a threshold-based rule happily returns a color with
     * ~3.9:1 contrast. Whichever color is returned must be the more
     * readable one, so compare the ratios directly.
     */
    check(
        "mid-tone gray gets the higher-contrast color",
        (() => {
            const bg = "#808080";
            const chosen = contrastTextColor(bg);
            const other =
                chosen === "#FFFFFF" ? "#0B0B0D" : "#FFFFFF";

            const lum = relativeLuminance(bg);

            const ratio = (hex) => {
                const l = Math.max(lum, relativeLuminance(hex));
                const d = Math.min(lum, relativeLuminance(hex));
                return (l + 0.05) / (d + 0.05);
            };

            return ratio(chosen) > ratio(other);
        })()
    );

    check(
        "relativeLuminance spans black to white",
        Math.abs(relativeLuminance("#000000")) < 1e-9 &&
            Math.abs(relativeLuminance("#FFFFFF") - 1) < 1e-9
    );

    check(
        "mixHex is exact at both ends",
        mixHex("#000000", "#FFFFFF", 0) === "#000000" &&
            mixHex("#000000", "#FFFFFF", 1) === "#FFFFFF"
    );

    check(
        "mixHex clamps an out-of-range amount",
        mixHex("#000000", "#FFFFFF", 5) === "#FFFFFF" &&
            mixHex("#000000", "#FFFFFF", -5) === "#000000"
    );

    /* ------------------------------------------------------------------ */
    section("derivePreviewState");

    check(
        "an empty draft still renders a full card",
        (() => {
            const state = derivePreviewState(draft(), "DiscordName");

            return (
                state.displayName === "DiscordName" &&
                state.palette.length >= 2 &&
                /^#[0-9A-F]{6}$/.test(state.bannerColor) &&
                /^#[0-9A-F]{6}$/.test(state.backgroundColor) &&
                /^#[0-9A-F]{6}$/.test(state.accentColor) &&
                state.incomplete === true
            );
        })()
    );

    check(
        "with no username and no fallback the name slot is filled",
        (() => {
            const state = derivePreviewState(draft(), null);

            return (
                typeof state.displayName === "string" &&
                state.displayName.length > 0 &&
                state.initials === "?"
            );
        })()
    );

    check(
        "the typed username wins over the Discord name",
        derivePreviewState(
            draft({ username: "aesthetic" }),
            "DiscordName"
        ).displayName === "aesthetic"
    );

    check(
        "the palette drives the banner and stays in order",
        (() => {
            const state = derivePreviewState(
                draft({ palette: ["#FF0000", "#00FF00"] })
            );

            return (
                state.bannerColor === "#FF0000" &&
                eq(state.palette, ["#FF0000", "#00FF00"])
            );
        })()
    );

    check(
        "the card background is dark even on a bright palette",
        (() => {
            const state = derivePreviewState(
                draft({ palette: ["#FFFFFF", "#FFFFFF"] })
            );

            return relativeLuminance(state.backgroundColor) < 0.5;
        })()
    );

    check(
        "text color is readable on the derived background",
        (() => {
            const palettes = [
                ["#000000", "#000000"],
                ["#FFFFFF", "#FFFFFF"],
                ["#7C3AED", "#EC4899"],
                ["#808080", "#808080"],
                ["#FFD400", "#FF6B00"],
            ];

            return palettes.every((palette) => {
                const state = derivePreviewState(
                    draft({ palette })
                );

                const lum = relativeLuminance(
                    state.backgroundColor
                );

                const ratio = (hex) => {
                    const l = Math.max(
                        lum,
                        relativeLuminance(hex)
                    );
                    const d = Math.min(
                        lum,
                        relativeLuminance(hex)
                    );
                    return (l + 0.05) / (d + 0.05);
                };

                return ratio(state.textColor) >= 4.5;
            });
        })()
    );

    check(
        "an explicit accent wins over the palette",
        derivePreviewState(
            draft({
                palette: ["#000000", "#FFFFFF"],
                accentColor: "#123456",
            })
        ).accentColor === "#123456"
    );

    check(
        "the discriminator is rendered with a hash",
        derivePreviewState(
            draft({
                palette: ["#000000", "#FFFFFF"],
                discriminator: "1234",
            })
        ).discriminator === "#1234"
    );

    check(
        "a single-color palette is padded so the bar still reads as a bar",
        (() => {
            const state = derivePreviewState(
                draft({ palette: ["#FF0000", "garbage"] })
            );

            return (
                state.palette.length >= 2 &&
                state.incomplete === true
            );
        })()
    );

    check(
        "a full palette is not marked incomplete",
        derivePreviewState(
            draft({ palette: ["#000000", "#FFFFFF"] })
        ).incomplete === false
    );

    check(
        "initials take at most two letters",
        initialsOf("aesthetic king") === "AK" &&
            initialsOf("king") === "KI" &&
            initialsOf("a") === "A" &&
            initialsOf("  ") === "?" &&
            initialsOf("ana-bot") === "AB"
    );

    /* ------------------------------------------------------------------ */
    section("checkCompleteness");

    check(
        "an empty draft lists every required field",
        (() => {
            const result = checkCompleteness(draft());

            return (
                result.complete === false &&
                result.missing.includes("username") &&
                result.missing.includes("profile set") &&
                result.missing.includes("palette") &&
                result.missing.includes("bio") &&
                result.missing.includes("status") &&
                result.missing.includes("symbols")
            );
        })()
    );

    check(
        "a filled draft is complete",
        checkCompleteness(
            draft({
                username: "king",
                profileSetId: "4",
                palette: ["#000000", "#FFFFFF"],
                bio: "hi",
                status: "online",
                symbols: ["♡"],
            })
        ).complete === true
    );

    check(
        "one missing field is reported alone",
        (() => {
            const result = checkCompleteness(
                draft({
                    username: "king",
                    profileSetId: "4",
                    palette: ["#000000", "#FFFFFF"],
                    bio: "hi",
                    status: "online",
                    symbols: [],
                })
            );

            return (
                result.complete === false &&
                eq(result.missing, ["symbols"])
            );
        })()
    );

    check(
        "emptyDraft is a valid empty draft",
        (() => {
            const value = emptyDraft();

            return (
                eq(
                    checkCompleteness(value).missing,
                    checkCompleteness(draft()).missing
                ) &&
                eq(value.palette, []) &&
                eq(value.symbols, [])
            );
        })()
    );

    check(
        "emptyDraft accepts overrides",
        emptyDraft({ username: "king" }).username === "king"
    );

    /* ------------------------------------------------------------------ */
    section("Save guard");

    /*
     * The Builder autosaves, so it needs to know locally whether a draft
     * would survive `parseProfileInput`. If the two ever disagree the
     * user either sees a 400 for a draft they never asked to save, or a
     * Save button that silently refuses a valid one.
     */
    check(
        "an empty draft is not saveable",
        canSaveDraft(emptyDraft()) === false
    );

    check(
        "one color is not enough to be saveable",
        canSaveDraft(
            emptyDraft({ palette: ["#000000"] })
        ) === false
    );

    check(
        "a full palette makes a draft saveable",
        canSaveDraft(
            emptyDraft({
                palette: ["#000000", "#FFFFFF"],
            })
        ) === true
    );

    check(
        "a profile set makes a draft saveable on its own",
        canSaveDraft(
            emptyDraft({ profileSetId: "12" })
        ) === true
    );

    check(
        "text alone never makes a draft saveable",
        canSaveDraft(
            emptyDraft({
                name: "Mine",
                username: "king",
                bio: "hello",
                status: "away",
                symbols: ["♡"],
            })
        ) === false
    );

    check(
        "the guard agrees with the parser on a rejected draft",
        (() => {
            const draft = emptyDraft({
                username: "king",
                palette: ["#000000"],
            });

            const parsed = parseProfileInput({
                name: draft.name,
                username: draft.username,
                palette: draft.palette,
                symbols: draft.symbols,
            });

            return (
                canSaveDraft(draft) === false &&
                parsed.ok === false
            );
        })()
    );

    check(
        "the guard agrees with the parser on an accepted draft",
        (() => {
            const draft = emptyDraft({
                username: "king",
                profileSetId: "7",
            });

            const parsed = parseProfileInput({
                name: draft.name,
                username: draft.username,
                profileSetId: draft.profileSetId,
            });

            return (
                canSaveDraft(draft) === true &&
                parsed.ok === true
            );
        })()
    );

    check(
        "completeness is stricter than the save guard",
        (() => {
            const draft = emptyDraft({
                profileSetId: "7",
            });

            return (
                canSaveDraft(draft) === true &&
                checkCompleteness(draft).complete === false
            );
        })()
    );

    /* ------------------------------------------------------------------ */
    section("Version entitlement");

    /*
     * `profiles.ts` imports `next/server` (via apiError) and opens a pool
     * (via database), neither of which exists out here, so both are
     * shimmed. The SQL itself is untouched — the database section below
     * reuses this same module with a real connection.
     */
    const profiles = loadModule(PROFILES_PATH, {
        "./apiError": {
            ExpectedError: class ExpectedError extends Error {},
        },
        "./database": {
            query: async () => {
                throw new Error("database should not be reached");
            },
            withTransaction: async () => {
                throw new Error("database should not be reached");
            },
        },
    });

    const { canCreateMoreProfiles } = profiles;

    check(
        "a free user with no profiles may create one",
        canCreateMoreProfiles(0, false) === true
    );

    check(
        "a free user at the limit may not create another",
        canCreateMoreProfiles(FREE_PROFILE_VERSIONS, false) === false
    );

    check(
        "a free user over the limit may not create another",
        canCreateMoreProfiles(FREE_PROFILE_VERSIONS + 5, false) === false
    );

    check(
        "an unlocked user is never blocked by the count",
        canCreateMoreProfiles(0, true) === true &&
            canCreateMoreProfiles(9999, true) === true
    );

    check(
        "the free tier really is one version",
        FREE_PROFILE_VERSIONS === 1
    );

    /* ------------------------------------------------------------------ */
    await databaseSection();

    /* ------------------------------------------------------------------ */
    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed > 0 ? 1 : 0);
}

/**
 * Runs the Studio's hand-written Profile SQL against the real schema.
 *
 * The Studio has no Prisma client — every statement in `profiles.ts` is
 * raw text, so a typo in a column name or an ambiguous `id` in one of
 * its joins would only surface as a 500 in a browser. This section
 * reuses the module already loaded above, swapping the stubbed
 * `./database` for a real connection, so what is exercised is the exact
 * SQL the Worker runs.
 */
async function databaseSection() {
    section("Profile SQL (database)");

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

    /*
     * A live module needs a live database. Re-loading with the real
     * adapter is cheaper than trying to make the stubbed instance
     * switchable.
     */
    const adapter = {
        query: async (text, values = []) =>
            client.query(text, values),

        withTransaction: async (work) => {
            await client.query("BEGIN");

            try {
                const result = await work(client);
                await client.query("COMMIT");
                return result;
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        },
    };

    const db = loadModule(PROFILES_PATH, {
        "./apiError": {
            ExpectedError: class ExpectedError extends Error {},
        },
        "./database": adapter,
    });

    const discordId = "900000000000000099";

    async function cleanup() {
        await client.query(
            `
            DELETE FROM "Profile"
            WHERE "userId" IN (
                SELECT id FROM "User" WHERE "discordId" = $1
            )
            `,
            [discordId]
        );

        await client.query(
            `DELETE FROM "User" WHERE "discordId" = $1`,
            [discordId]
        );
    }

    try {
        await cleanup();

        const user = await client.query(
            `
            INSERT INTO "User" (
                id, "discordId", username, "createdAt", "updatedAt"
            )
            VALUES (
                'profile-builder-test-user', $1, 'builder-test',
                NOW(), NOW()
            )
            RETURNING id
            `,
            [discordId]
        );

        const userId = user.rows[0].id;

        check(
            "a user row exists to hang profiles on",
            typeof userId === "string" && userId.length > 0
        );

        check(
            "a user with no profiles lists none",
            (
                await db.getProfilesByDiscordId(discordId)
            ).length === 0 &&
            (await db.countProfilesForDiscordUser(discordId)) === 0 &&
            (
                await db.getActiveProfileForDiscordUser(discordId)
            ) === null
        );

        const first =
            await db.createProfileForDiscordUser(discordId, {
                name: "  First version  ",
                profileSetId: "12",
                username: "king",
                discriminator: "#0042",
                bio: "hello",
                palette: ["#7c3aed", "#EC4899", "#7C3AED"],
                symbols: [" ♡ ", "♡", "⋆"],
                accentColor: "ec4899",
            });

        check(
            "create returns the row with a generated id",
            typeof first.id === "string" &&
                first.id.length > 0 &&
                first.isActive === true
        );

        check(
            "create normalized the input on the way in",
            first.name === "First version" &&
                first.discriminator === "0042" &&
                first.accentColor === "#EC4899" &&
                eq(first.palette, ["#7C3AED", "#EC4899"]) &&
                eq(first.symbols, ["♡", "⋆"])
        );

        check(
            "timestamps were written",
            first.createdAt instanceof Date &&
                first.updatedAt instanceof Date
        );

        check(
            "a profile with neither colors nor a set is refused",
            await db
                .createProfileForDiscordUser(discordId, {
                    name: "bad",
                })
                .then(
                    () => false,
                    (error) =>
                        error instanceof Error &&
                        typeof error.message === "string"
                )
        );

        const second =
            await db.createProfileForDiscordUser(discordId, {
                name: "Second version",
                palette: ["#000000", "#FFFFFF"],
            });

        const listed =
            await db.getProfilesByDiscordId(discordId);

        check(
            "both profiles are listed for the user",
            listed.length === 2 &&
                (await db.countProfilesForDiscordUser(discordId)) === 2
        );

        check(
            "creating as active cleared the earlier profile",
            listed.filter((entry) => entry.isActive).length === 1 &&
                listed.find((entry) => entry.isActive).id ===
                    second.id
        );

        check(
            "the active read returns the active profile",
            (
                await db.getActiveProfileForDiscordUser(discordId)
            ).id === second.id
        );

        check(
            "reading by id returns the row",
            (
                await db.getProfileByIdForDiscordUser(
                    first.id,
                    discordId
                )
            )?.name === "First version"
        );

        check(
            "another user cannot read it by id",
            (
                await db.getProfileByIdForDiscordUser(
                    first.id,
                    "900000000000000098"
                )
            ) === null
        );

        const renamed =
            await db.updateProfileForDiscordUser(
                first.id,
                discordId,
                { name: "Renamed" }
            );

        check(
            "a patch writes only the field it carries",
            renamed?.name === "Renamed" &&
                eq(renamed.palette, ["#7C3AED", "#EC4899"]) &&
                renamed.bio === "hello" &&
                renamed.profileSetId === "12"
        );

        check(
            "a patch can clear a field with null",
            (
                await db.updateProfileForDiscordUser(
                    first.id,
                    discordId,
                    { bio: null }
                )
            )?.bio === null
        );

        check(
            "an empty patch is a no-op read, not broken SQL",
            (
                await db.updateProfileForDiscordUser(
                    first.id,
                    discordId,
                    {}
                )
            )?.id === first.id
        );

        check(
            "a patch normalizes what it is given",
            (
                await db.updateProfileForDiscordUser(
                    first.id,
                    discordId,
                    {
                        palette: ["#000000", "nope", "#000000"],
                        discriminator: "x12",
                    }
                )
            )?.palette.length === 1
        );

        check(
            "another user cannot patch it",
            (
                await db.updateProfileForDiscordUser(
                    first.id,
                    "900000000000000098",
                    { name: "stolen" }
                )
            ) === null
        );

        const activated =
            await db.setActiveProfileForDiscordUser(
                first.id,
                discordId
            );

        const afterActivate =
            await db.getProfilesByDiscordId(discordId);

        check(
            "making one profile active clears the others",
            activated?.id === first.id &&
                afterActivate.filter(
                    (entry) => entry.isActive
                ).length === 1 &&
                afterActivate.find((entry) => entry.isActive).id ===
                    first.id
        );

        check(
            "a stranger cannot activate it",
            (
                await db.setActiveProfileForDiscordUser(
                    first.id,
                    "900000000000000098"
                )
            ) === null
        );

        check(
            "delete removes exactly the owner's row",
            (
                await db.deleteProfileForDiscordUser(
                    first.id,
                    "900000000000000098"
                )
            ) === false &&
            (
                await db.deleteProfileForDiscordUser(
                    first.id,
                    discordId
                )
            ) === true &&
            (
                await db.getProfilesByDiscordId(discordId)
            ).length === 1
        );

        check(
            "deleting twice reports false the second time",
            (
                await db.deleteProfileForDiscordUser(
                    first.id,
                    discordId
                )
            ) === false
        );

        check(
            "the last profile can be deleted",
            (
                await db.deleteProfileForDiscordUser(
                    second.id,
                    discordId
                )
            ) === true &&
            (
                await db.getProfilesByDiscordId(discordId)
            ).length === 0
        );

        await cleanup();
    } catch (error) {
        check(
            "the Profile SQL runs against the real schema",
            false,
            error.message
        );

        try {
            await cleanup();
        } catch {
            // Best effort; the throwaway user may already be gone.
        }
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
