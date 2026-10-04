#!/usr/bin/env node
/**
 * Publish Profiles + Aesthetic Packs to Discover — verification suite.
 *
 * Phase 7's last feature widens the polymorphic `SharedPost` feed with two new
 * `SharedItemType` members: PROFILE (a composed profile) and PACK (a server's
 * Aesthetic Pack). Both flow through the same publish path, the same crown
 * reward, the same hydration layer and the same search index.
 *
 *   Part 1 — static checks (schema enum, migration ordering, source guards)
 *   Part 2 — module-level checks against a fake database
 *   Part 3 — a live end-to-end run against Postgres (skipped when unreachable)
 *   Part 4 — type-check
 *
 * Run: node scripts/testPublishToDiscover.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const STUDIO = path.join(ROOT, "studio");
const LIB = path.join(STUDIO, "lib");
const APP = path.join(STUDIO, "app");

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function section(title) {
    console.log("\n\u001b[1m" + title + "\u001b[0m");
}

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log("  \u001b[32mPASS\u001b[0m " + name);
    } else {
        failed++;
        failures.push(name);
        console.log("  \u001b[31mFAIL\u001b[0m " + name + (detail ? "  \u001b[90m" + detail + "\u001b[0m" : ""));
    }
}

async function expectThrowsAsync(name, fn, messagePart) {
    let err = null;
    try {
        await fn();
    } catch (e) {
        err = e;
    }
    if (!err) {
        check(name, false, "no error was thrown");
        return null;
    }
    const ok = !messagePart || String(err.message || "").includes(messagePart);
    check(name, ok, ok ? undefined : "threw: " + String(err.message || err));
    return err;
}

function skip(name, why) {
    skipped++;
    console.log("  \u001b[33mSKIP\u001b[0m " + name + "  \u001b[90m" + why + "\u001b[0m");
}

function readSource(...parts) {
    return fs.readFileSync(path.join(...parts), "utf8");
}

/** Collapse whitespace so heavily hand-wrapped source still matches. */
function squash(text) {
    return String(text).replace(/\s+/g, " ");
}

function sourceIncludes(...parts) {
    return squash(readSource(...parts));
}

// ---------------------------------------------------------------------------
// Module loader
// ---------------------------------------------------------------------------
//
// The Studio lib is TypeScript, so each module is transpiled to CommonJS with
// esbuild and evaluated with a `require` shim. Stubs are keyed by the exact
// specifier the module writes ("./database"); anything else resolves to a real
// sibling .ts/.json file and loads the same way. `next/server` only exists
// inside the Next build, so it is stubbed globally.

let esbuild = null;
function loadEsbuild() {
    if (!esbuild) {
        for (const candidate of [path.join(STUDIO, "node_modules", "esbuild"), path.join(ROOT, "node_modules", "esbuild")]) {
            if (fs.existsSync(candidate)) {
                esbuild = require(candidate);
                break;
            }
        }
        if (!esbuild) throw new Error("esbuild is unavailable");
    }
    return esbuild;
}

function loadModule(modulePath, stubRequire = {}) {
    const stubs = {
        "next/server": { NextResponse: { json: () => ({}) } },
        ...stubRequire,
    };

    const result = loadEsbuild().transformSync(fs.readFileSync(modulePath, "utf8"), {
        loader: "ts",
        format: "cjs",
        target: "node20",
    });

    const module = { exports: {} };

    const req = (specifier) => {
        if (Object.prototype.hasOwnProperty.call(stubs, specifier)) return stubs[specifier];

        if (specifier.startsWith(".")) {
            const base = path.resolve(path.dirname(modulePath), specifier);
            if (base.endsWith(".json") && fs.existsSync(base)) {
                return JSON.parse(fs.readFileSync(base, "utf8"));
            }
            for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
                if (fs.existsSync(candidate)) return loadModule(candidate, stubs);
            }
        }

        throw new Error("testPublishToDiscover: cannot resolve \"" + specifier + "\" from " + modulePath);
    };

    // esbuild's cjs output assigns `module.exports`, not `exports`.
    new Function("module", "exports", "require", result.code)(module, module.exports, req);
    return module.exports;
}

// ---------------------------------------------------------------------------
// Fake database
// ---------------------------------------------------------------------------

function createFakeDb() {
    const calls = [];
    const db = {
        calls,
        handlers: [],
        once: [],
        forbidden: [],
        query: async (text, values = []) => {
            const sql = squash(String(text));
            calls.push({ sql, raw: String(text), params: values });
            for (const entry of db.forbidden) {
                if (sql.includes(entry.match)) throw new Error("forbidden SQL executed: " + entry.match);
            }
            for (let i = 0; i < db.once.length; i++) {
                const entry = db.once[i];
                if (sql.includes(entry.match)) {
                    db.once.splice(i, 1);
                    if (entry.error) throw new Error(entry.error);
                    const rows = typeof entry.rows === "function" ? entry.rows(values, sql) : (entry.rows || []);
                    return { rows, rowCount: entry.rowCount ?? rows.length };
                }
            }
            for (const entry of db.handlers) {
                if (sql.includes(entry.match)) {
                    if (entry.error) throw new Error(entry.error);
                    const rows = typeof entry.rows === "function" ? entry.rows(values, sql) : (entry.rows || []);
                    return { rows, rowCount: entry.rowCount ?? rows.length };
                }
            }
            return { rows: [], rowCount: 0 };
        },
        withTransaction: async (fn) => fn(db),
        on(match, rows, extra) {
            db.handlers.push({ match: squash(match), rows, ...(extra || {}) });
            return db;
        },
        forbid(match) {
            db.forbidden.push({ match: squash(match) });
            return db;
        },
        find(pattern) {
            const p = squash(pattern);
            return calls.find((c) => c.sql.includes(p));
        },
        all(pattern) {
            const p = squash(pattern);
            return calls.filter((c) => c.sql.includes(p));
        },
        count(pattern) {
            return db.all(pattern).length;
        },
        reset() {
            calls.length = 0;
        },
    };
    return db;
}

function adapterOf(db) {
    return { query: db.query, withTransaction: db.withTransaction, getPostgresAdapter: async () => db };
}

const EXPECTED_ERROR = class ExpectedError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = "ExpectedError";
        this.status = status;
    }
};

function apiErrorStub() {
    return {
        ExpectedError: EXPECTED_ERROR,
        handleRouteError: () => { throw new Error("handleRouteError should not run in unit checks"); },
    };
}

const CATALOG_STUB = {
    getAssetSets: () => [
        { id: "10", premium: false, enabled: true },
        { id: "11", premium: false, enabled: true },
        { id: "12", premium: true, enabled: true },
        { id: "13", premium: false, enabled: true },
    ],
    getAssetSetById: (id) => (id === "999999" ? null : { id, premium: id === "12", enabled: true }),
    isPremiumSet: (id) => id === "12",
};

const ASSETS_STUB = {
    buildAssetUrl: (key) => "https://cdn.example/" + key,
    tryGetProfileAssets: (id) => (id ? { pfpUrl: "https://cdn.example/" + id + "-pfp.png", bannerUrl: "https://cdn.example/" + id + "-banner.png" } : null),
    getProfileAssets: (id) => ASSETS_STUB.tryGetProfileAssets(id),
    profileMediaFromSet: (id) => {
        const a = ASSETS_STUB.tryGetProfileAssets(id);
        return a ? { setId: id, pfpUrl: a.pfpUrl, bannerUrl: a.bannerUrl } : null;
    },
};

const REMIX_STUB = {
    getAttributionsForPosts: async () => new Map(),
    premiumSetForPost: () => null,
};

const NOTIFICATIONS_STUB = {
    createNotificationForDiscordUser: async () => ({ id: "notif-1" }),
};

/**
 * `crownEarning` only needs `getPeriodKey` from `features.ts`, and that module
 * is pure (no imports), so the real one is loaded rather than a stub.
 */
function crownStubs(db) {
    return {
        "./database": adapterOf(db),
        "./features": loadModule(path.join(LIB, "features.ts"), {}),
    };
}

/**
 * A fake DB wired for `awardCrowns`.
 *
 * The award runs five statements: a lock-free duplicate probe, a row lock on
 * "User", an in-transaction duplicate probe, the daily totals, then the ledger
 * insert. `options` bends the middle ones so a single helper covers every case.
 */
function crownDb(options = {}) {
    const db = createFakeDb();
    db.crownTotals = null;

    // Registered first: the lock-free duplicate probe joins "User", and the
    // handler list matches in registration order.
    db.on('FROM "CrownTransaction"', (params, sql) => {
        if (sql.includes("SELECT ct.id")) {
            return options.alreadyAwarded ? [{ id: "tx-1" }] : [];
        }
        if (sql.includes("COUNT(*) FILTER")) {
            db.crownTotals = params;
            return [{
                source_count: options.sourceCount ?? 0,
                total_amount: options.totalAmount ?? 0,
            }];
        }
        // The in-transaction duplicate probe.
        return [];
    });

    db.on('FROM "User"', (params, sql) => {
        if (!sql.includes("FOR UPDATE")) return [];
        return options.unknownUser ? [] : [{ id: "user-row-1" }];
    });

    db.on('INSERT INTO "CrownTransaction"', () => [{ id: "tx-new", type: "EARN" }]);

    return db;
}

function crownEarningModule(db) {
    return loadModule(path.join(LIB, "crownEarning.ts"), crownStubs(db));
}

/** A SharedPost row exactly as FEED_SELECT_SQL returns it (author* aliases). */
function postRow(overrides = {}) {
    return {
        id: "post-1",
        itemType: "PROFILE",
        itemId: "prof-1",
        caption: "fresh look",
        tags: ["profile", "dark"],
        likeCount: 3,
        commentCount: 1,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        authorId: "user-row-1",
        authorDiscordId: "900000000000000911",
        authorUsername: "nova",
        authorDisplayName: "Nova",
        authorAvatarHash: "abc123",
        likedByViewer: false,
        ...overrides,
    };
}

// ===========================================================================
// Part 1 — static / schema checks
// ===========================================================================

function partOne() {
    section("Part 1: schema, enum and migration safety");

    const schema = readSource(ROOT, "prisma", "schema.prisma");
    const enumBlock = /enum SharedItemType \{([^}]*)\}/.exec(schema);
    check("SharedItemType enum exists in schema.prisma", Boolean(enumBlock));
    const members = enumBlock ? enumBlock[1] : "";
    check("enum declares PROFILE", /\bPROFILE\b/.test(members));
    check("enum declares PACK", /\bPACK\b/.test(members));
    for (const existing of ["AESTHETIC", "PALETTE", "ASSET"]) {
        check("enum keeps " + existing, new RegExp("\\b" + existing + "\\b").test(members));
    }

    const postModel = /model SharedPost \{([\s\S]*?)\n\}/.exec(schema);
    const postBody = postModel ? postModel[1] : "";
    check("SharedPost is indexed on (itemType, itemId)", /@@index\(\[itemType, itemId\]\)/.test(postBody), postBody.replace(/\s+/g, " "));
    check("SharedPost keeps its per-author uniqueness", /@@unique\(\[userId, itemType, itemId\]\)/.test(postBody));

    // A Discover chip filters on itemType and sorts by time (or popularity).
    // (itemType, itemId) cannot serve that sort and (createdAt) ignores the
    // filter, so the composite indexes below are what keep a filtered page
    // from scanning the feed.
    check("SharedPost is indexed on (itemType, createdAt)", /@@index\(\[itemType, createdAt\]\)/.test(postBody));
    check("SharedPost is indexed on (itemType, likeCount, createdAt)", /@@index\(\[itemType, likeCount, createdAt\]\)/.test(postBody));

    const migrationsDir = path.join(ROOT, "prisma", "migrations");
    const dirs = fs.existsSync(migrationsDir)
        ? fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
        : [];
    check("migrations exist", dirs.length > 0);

    const addRe = /ALTER TYPE [^\n]*ADD VALUE(?: IF NOT EXISTS)? '(?:PROFILE|PACK)'/;
    const useRe = /'(?:PROFILE|PACK)'::"?SharedItemType"?/;
    const addDirs = [];
    const addAndUse = [];
    for (const dir of dirs) {
        const sqlPath = path.join(migrationsDir, dir, "migration.sql");
        if (!fs.existsSync(sqlPath)) continue;
        const sql = fs.readFileSync(sqlPath, "utf8");
        const adds = addRe.test(sql);
        const uses = useRe.test(sql);
        if (adds) addDirs.push(dir);
        if (adds && uses) addAndUse.push(dir);
    }
    check("a migration adds the new enum values", addDirs.length > 0, "found: " + addDirs.join(", "));

    // Postgres 18 forbids *using* a newly added enum value in a later statement
    // of the same transaction, and Prisma wraps each migration file in one
    // transaction — so no single file may both add and use a value.
    check("no migration adds and uses a new enum value in one transaction", addAndUse.length === 0, addAndUse.join(", "));

    const firstAdd = addDirs.length ? dirs.indexOf(addDirs[0]) : -1;
    const usedTooEarly = dirs.filter((dir, i) => {
        if (i > firstAdd || firstAdd < 0) return false;
        const sqlPath = path.join(migrationsDir, dir, "migration.sql");
        return fs.existsSync(sqlPath) && useRe.test(fs.readFileSync(sqlPath, "utf8"));
    });
    check("no migration uses the value before it is added", usedTooEarly.length === 0, usedTooEarly.join(", "));

    section("Part 1b: the shared item-type surface knows about both types");

    const db = createFakeDb();
    const sharedFeed = loadModule(path.join(LIB, "sharedFeed.ts"), {
        "./database": adapterOf(db),
        "./assetCatalog": CATALOG_STUB,
        "./apiError": apiErrorStub(),
        "./crownEarning": { awardForPublish: async () => ({ awarded: 0 }), awardForRemix: async () => ({ awarded: 0 }) },
        "./notifications": NOTIFICATIONS_STUB,
    });

    check("SHARED_ITEM_TYPES includes PROFILE", sharedFeed.SHARED_ITEM_TYPES.includes("PROFILE"));
    check("SHARED_ITEM_TYPES includes PACK", sharedFeed.SHARED_ITEM_TYPES.includes("PACK"));
    check("SHARED_ITEM_TYPES has 5 members", sharedFeed.SHARED_ITEM_TYPES.length === 5, "got " + sharedFeed.SHARED_ITEM_TYPES.join(","));
    check("isSharedItemType accepts PROFILE", sharedFeed.isSharedItemType("PROFILE") === true);
    check("isSharedItemType accepts PACK", sharedFeed.isSharedItemType("PACK") === true);
    check("isSharedItemType rejects junk", sharedFeed.isSharedItemType("NFT") === false);
    check("isSharedItemType rejects non-strings", sharedFeed.isSharedItemType(null) === false && sharedFeed.isSharedItemType(7) === false);
    check("publishVerifiedItemToFeed is exported for pack publishing", typeof sharedFeed.publishVerifiedItemToFeed === "function");
    check("removePostsForItem is exported", typeof sharedFeed.removePostsForItem === "function");

    section("Part 1c: the feed route keeps PACK out of the generic publish path");

    const feedRoute = sourceIncludes(APP, "api", "feed", "route.ts");
    const allowList = /const ROUTE_ITEM_TYPES: SharedItemType\[\] = \[([^\]]*)\]/.exec(feedRoute);
    check("the feed route declares an explicit item-type allow-list", Boolean(allowList), "no ROUTE_ITEM_TYPES found");
    const allowed = allowList ? allowList[1] : "";
    check("the feed route accepts PROFILE", /"PROFILE"/.test(allowed), allowed.replace(/\s+/g, " "));
    check("the feed route does NOT accept PACK", !/"PACK"/.test(allowed), allowed.replace(/\s+/g, " "));
    check("the feed route rejects PACK with a message", feedRoute.includes("Aesthetic Packs are published from Server Studio"));
    check("the pack publish route exists", fs.existsSync(path.join(APP, "api", "servers", "[id]", "packs", "[packId]", "publish", "route.ts")));
}

// ===========================================================================
// Part 2 — behaviour against a fake database
// ===========================================================================

function loadSharedFeed(db, extraStubs = {}) {
    const awards = extraStubs.publishAwards || [];
    const stubs = {
        "./database": adapterOf(db),
        "./assetCatalog": CATALOG_STUB,
        "./apiError": apiErrorStub(),
        "./crownEarning": {
            awardForPublish: async (discordId, itemType, itemId) => {
                awards.push({ discordId, itemType, itemId });
                return { awarded: 5, balance: 5, capped: false };
            },
            awardForRemix: async () => ({ awarded: 0 }),
        },
        "./notifications": NOTIFICATIONS_STUB,
        ...extraStubs,
    };
    stubs.publishAwards = awards;
    // The upsert only needs to hand back an id; getFeedPostById supplies the row.
    if (!db.handlers.some((h) => h.match.includes('INSERT INTO "SharedPost"'))) {
        db.on('INSERT INTO "SharedPost"', () => [{ id: "post-1" }]);
    }
    return loadModule(path.join(LIB, "sharedFeed.ts"), stubs);
}

/**
 * The ownership probe is one UNION ALL statement keyed on itemType in $2, and
 * its INNER JOIN on the publisher means it yields a row only when the item's
 * owner *is* the publisher. `kindToUserId` says who owns each kind; "user-row-1"
 * is the row behind the publisher's discord id, so any other value behaves like
 * someone else's item.
 */
const PUBLISHER_USER_ROW = "user-row-1";

function ownOwnershipProbe(db, kindToUserId) {
    db.on('FROM "SavedAesthetic" sa', (params) => {
        const userId = kindToUserId[params[1]];
        return userId === PUBLISHER_USER_ROW ? [{ id: params[0] }] : [];
    });
}

async function partTwo() {
    section("Part 2: the ownership guard cannot be bypassed by itemType");

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        db.on('FROM "SharedPost" sp', () => [postRow()]);
        const sharedFeed = loadSharedFeed(db);
        const post = await sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-1" });
        check("an author can publish their own composed profile", post && post.itemType === "PROFILE");
        const probe = db.find('FROM "SavedAesthetic" sa');
        check("the ownership probe is parameterised on itemType", Boolean(probe) && probe.params[1] === "PROFILE", probe && JSON.stringify(probe.params));
        check("the ownership probe never interpolates itemId", Boolean(probe) && !probe.sql.includes("'prof-1'"));
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "someone-else" });
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "publishing someone else's profile is refused",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-1" }),
            "only publish something of your own"
        );
        check("a refused publish writes no SharedPost", db.count('INSERT INTO "SharedPost"') === 0);
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PALETTE: "user-row-1" });
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "a PALETTE id cannot be published by claiming it is a PROFILE",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "pal-1" }),
            "only publish something of your own"
        );
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "a PROFILE id cannot be published by claiming it is a PALETTE",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PALETTE", itemId: "prof-1" }),
            "only publish something of your own"
        );
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PACK: "user-row-1" });
        db.forbid('INSERT INTO "SharedPost"');
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "shareItemToFeed refuses PACK outright",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PACK", itemId: "pack-1" }),
            "published from Server Studio"
        );
        check("a PACK id cannot be published through the generic feed path", db.count('INSERT INTO "SharedPost"') === 0);
    }

    {
        const db = createFakeDb();
        db.on('INSERT INTO "SharedPost"', () => [{ id: "post-1" }]);
        db.on('FROM "SharedPost" sp', () => [postRow({ itemType: "ASSET", itemId: "10" })]);
        const sharedFeed = loadSharedFeed(db);
        const post = await sharedFeed.shareItemToFeed("900000000000000911", { itemType: "ASSET", itemId: "10" });
        check("a catalogue asset set can be published", post && post.itemType === "ASSET");
        check("an ASSET publish skips the ownership UNION probe", db.count('FROM "SavedAesthetic" sa') === 0);
    }

    {
        const db = createFakeDb();
        db.forbid('INSERT INTO "SharedPost"');
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "an unknown asset set id is refused",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "ASSET", itemId: "999999" }),
            "does not exist"
        );
    }

    section("Part 2b: publishing is idempotent and re-publishing does not duplicate");

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        db.on('INSERT INTO "SharedPost"', () => [{ id: "post-1" }]);
        db.on('FROM "SharedPost" sp', () => [postRow()]);
        const awards = [];
        const sharedFeed = loadSharedFeed(db, { publishAwards: awards });
        await sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-1", caption: "first" });
        await sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-1", caption: "second" });
        const update = db.find('ON CONFLICT');
        check("re-publishing takes an ON CONFLICT upsert", Boolean(update));
        check("the conflict target is the unique (userId, itemType, itemId)", update && /ON CONFLICT \("userId", "itemType", "itemId"\)/.test(update.sql), update && update.sql.slice(0, 200));
        check("the conflict update refreshes the caption", update && /caption = EXCLUDED\.caption/.test(update.sql));
        check("the conflict update never touches the counters", update && !/"likeCount" = EXCLUDED/.test(update.sql) && !/"commentCount" = EXCLUDED/.test(update.sql));
        check("the author comes from the publisher parameter", update && update.params[0] === "900000000000000911", update && JSON.stringify(update.params));
        check("the crown award is keyed on the item, not the post", awards.length === 2 && awards.every((a) => a.itemType === "PROFILE" && a.itemId === "prof-1"), JSON.stringify(awards));
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        db.on('INSERT INTO "SharedPost"', (params) => {
            db.insertedParams = params;
            return [{ id: "post-1" }];
        });
        db.on('FROM "SharedPost" sp', () => [postRow()]);
        const sharedFeed = loadSharedFeed(db);
        const post = await sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-9", caption: "hello" });
        check("a new post is returned after the read-back", post && post.id === "post-1");
        const insert = db.find('INSERT INTO "SharedPost"');
        check("the insert stores itemType and itemId", insert && insert.params[1] === "PROFILE" && insert.params[2] === "prof-9", insert && JSON.stringify(insert.params));
        check("the insert initialises both counters to 0", insert && /,\s*0,\s*0,/.test(insert.sql), insert && insert.sql.slice(0, 400));
        check("the insert mints its id in SQL", insert && insert.sql.includes("gen_random_uuid()"));
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        db.on('INSERT INTO "SharedPost"', () => []);
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "a publish for an unknown account is reported as a failure",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-1" }),
            "Unable to share item"
        );
    }

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        db.on('INSERT INTO "SharedPost"', () => [{ id: "post-1" }]);
        db.on('FROM "SharedPost" sp', () => []);
        const sharedFeed = loadSharedFeed(db);
        await expectThrowsAsync(
            "a publish that cannot be read back is reported as a failure",
            () => sharedFeed.shareItemToFeed("900000000000000911", { itemType: "PROFILE", itemId: "prof-1" }),
            "Unable to load the shared post"
        );
    }

    section("Part 2c: tags are normalised before they reach Discover");

    {
        const db = createFakeDb();
        ownOwnershipProbe(db, { PROFILE: "user-row-1" });
        db.on('INSERT INTO "SharedPost"', () => [{ id: "post-1" }]);
        db.on('FROM "SharedPost" sp', () => [postRow()]);
        const sharedFeed = loadSharedFeed(db);
        await sharedFeed.shareItemToFeed("900000000000000911", {
            itemType: "PROFILE",
            itemId: "prof-1",
            tags: ["  #Dark  ", "dark", "", "Aaaaaaaaaaaaaaaaaaaa", "cozy", "Cozy", "x", "yy", "zzz", "w", "v", "u", "t", "s"],
        });
        const insert = db.find('INSERT INTO "SharedPost"');
        const tags = insert.params[4];
        check("tags are trimmed, de-hashtagged and lowercased", tags.includes("dark"), JSON.stringify(tags));
        check("duplicate tags are removed case-insensitively", tags.filter((t) => t === "cozy").length === 1, JSON.stringify(tags));
        check("empty tags are dropped", !tags.includes(""));
        check("at most 10 tags are stored", tags.length <= 10, "got " + tags.length);
    }

    section("Part 2d: unpublishing and deleting remove the post");

    {
        const db = createFakeDb();
        db.on('DELETE FROM "SharedPost" WHERE', () => [], { rowCount: 2 });
        const sharedFeed = loadSharedFeed(db);
        const removed = await sharedFeed.removePostsForItem("PROFILE", "prof-1");
        const del = db.find('DELETE FROM "SharedPost" WHERE');
        check("removePostsForItem is typed and parameterised", del && del.params[0] === "PROFILE" && del.params[1] === "prof-1" && del.sql.includes('$1::"SharedItemType"'), del && JSON.stringify(del && del.params));
        check("removePostsForItem returns the deleted count", removed === 2);
    }

    {
        const db = createFakeDb();
        db.on('DELETE FROM "SharedPost" sp USING "User" u', () => [{ id: "post-1" }], { rowCount: 1 });
        const sharedFeed = loadSharedFeed(db);
        const removed = await sharedFeed.unshareItemById("post-1", "900000000000000911");
        const del = db.find('DELETE FROM "SharedPost" sp USING "User" u');
        check("unshareItemById is scoped to the viewer", del && del.params[0] === "post-1" && del.params[1] === "900000000000000911");
        check("unshareItemById reports success", removed === true);
    }

    {
        const db = createFakeDb();
        db.on('DELETE FROM "SharedPost" sp USING "User" u', () => [], { rowCount: 0 });
        const sharedFeed = loadSharedFeed(db);
        const removed = await sharedFeed.unshareItemById("post-1", "900000000000000999");
        check("unsharing someone else's post reports no change", removed === false);
    }

    {
        const db = createFakeDb();
        db.on('DELETE FROM "Profile" p USING "User" u', () => [{ id: "prof-1" }], { rowCount: 1 });
        const removals = [];
        const profiles = loadModule(path.join(LIB, "profiles.ts"), {
            "./database": adapterOf(db),
            "./apiError": apiErrorStub(),
            "./sharedFeed": { removePostsForItem: async (itemType, itemId) => { removals.push({ itemType, itemId }); return 1; } },
        });
        const deleted = await profiles.deleteProfileForDiscordUser("prof-1", "900000000000000911");
        check("deleting a profile reports success", deleted === true);
        check("deleting a profile removes its PROFILE post", removals.length === 1 && removals[0].itemType === "PROFILE" && removals[0].itemId === "prof-1", JSON.stringify(removals));
    }

    {
        const db = createFakeDb();
        db.on('DELETE FROM "Profile" p USING "User" u', () => [], { rowCount: 0 });
        const removals = [];
        const profiles = loadModule(path.join(LIB, "profiles.ts"), {
            "./database": adapterOf(db),
            "./apiError": apiErrorStub(),
            "./sharedFeed": { removePostsForItem: async (itemType, itemId) => { removals.push({ itemType, itemId }); return 0; } },
        });
        const deleted = await profiles.deleteProfileForDiscordUser("prof-1", "900000000000000999");
        check("deleting someone else's profile fails", deleted === false);
        check("a failed profile delete touches no post", removals.length === 0, JSON.stringify(removals));
    }

    {
        const db = createFakeDb();
        db.on('DELETE FROM "SavedAesthetic"', () => [{ id: "aesth-1" }], { rowCount: 1 });
        const removals = [];
        const saved = loadModule(path.join(LIB, "savedAesthetics.ts"), {
            "./database": adapterOf(db),
            "./apiError": apiErrorStub(),
            "./sharedFeed": { removePostsForItem: async (itemType, itemId) => { removals.push({ itemType, itemId }); return 1; } },
        });
        await saved.deleteSavedAestheticForDiscordUser("aesth-1", "900000000000000911");
        check("deleting an aesthetic cleans its AESTHETIC post (not PROFILE)", removals.length === 1 && removals[0].itemType === "AESTHETIC" && removals[0].itemId === "aesth-1", JSON.stringify(removals));
    }

    section("Part 2e: Aesthetic Packs are published guild-scopically");

    function packStubs(db) {
        return {
            "./database": adapterOf(db),
            "./apiError": apiErrorStub(),
            "./sharedFeed": {
                publishVerifiedItemToFeed: async (discordId, input) => {
                    db.packPublishes.push({ discordId, ...input });
                    return postRow({ itemType: "PACK", itemId: input.itemId, caption: input.caption });
                },
                removePostsForItem: async (itemType, itemId) => {
                    db.packRemovals.push({ itemType, itemId });
                    return 1;
                },
                getFeedPostById: async (id) => (id === "existing-post" ? postRow({ id: "existing-post", itemType: "PACK" }) : null),
                hasSharedItem: async () => false,
            },
        };
    }

    function packRow(overrides = {}) {
        return {
            id: "pack-1",
            guildId: "guild-row-1",
            name: "Midnight",
            description: "deep blues",
            aestheticId: null,
            moodId: null,
            colors: ["#0b1026", "#4f7cff"],
            symbols: ["moon"],
            enabled: true,
            createdAt: new Date("2026-01-01T00:00:00Z"),
            updatedAt: new Date("2026-01-01T00:00:00Z"),
            published: false,
            ...overrides,
        };
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => [packRow()]);
        db.on('FROM "SharedPost"', () => []);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        const post = await packs.publishPackToFeed("900000000000000500", "900000000000000911", "pack-1", "  our pack  ");
        const lookup = db.find('FROM "AestheticPack" p');
        check("the pack lookup joins Guild on the Discord guild id", lookup && lookup.sql.includes('INNER JOIN "Guild" g') && lookup.sql.includes('g."discordId" = $1'));
        check("the pack lookup is parameterised on guild then pack", lookup && lookup.params[0] === "900000000000000500" && lookup.params[1] === "pack-1", lookup && JSON.stringify(lookup.params));
        const pub = db.packPublishes[0];
        check("the pack post is authored by the publishing member", pub && pub.discordId === "900000000000000911");
        check("the pack post is typed PACK", post && post.itemType === "PACK");
        check("the supplied caption is forwarded to the post", pub && pub.caption === "  our pack  ", pub && JSON.stringify(pub));
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => [packRow()]);
        db.on('FROM "SharedPost"', () => []);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        await packs.publishPackToFeed("900000000000000500", "900000000000000911", "pack-1");
        const pub = db.packPublishes[0];
        check("a blank caption falls back to the pack description", pub && pub.caption === "deep blues", pub && JSON.stringify(pub));
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => [packRow({ description: null })]);
        db.on('FROM "SharedPost"', () => []);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        await packs.publishPackToFeed("900000000000000500", "900000000000000911", "pack-1");
        const pub = db.packPublishes[0];
        check("a pack with no description publishes with a null caption", pub && (pub.caption === null || pub.caption === undefined), pub && JSON.stringify(pub));
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => []);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        await expectThrowsAsync(
            "a pack from another server cannot be published",
            () => packs.publishPackToFeed("900000000000000500", "900000000000000911", "pack-of-another-guild"),
            "not found"
        );
        check("a refused pack publish inserts nothing", db.packPublishes.length === 0);
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => [packRow()]);
        db.on('FROM "SharedPost"', () => [{ id: "existing-post" }]);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        const post = await packs.publishPackToFeed("900000000000000500", "900000000000000911", "pack-1", "new caption");
        check("re-publishing a pack returns the existing post", post && post.id === "existing-post", post && JSON.stringify(post.id));
        check("re-publishing a pack does not publish a second post", db.packPublishes.length === 0, JSON.stringify(db.packPublishes));
        const existing = db.find('FROM "SharedPost" WHERE');
        check("the existing pack post lookup is PACK-typed", Boolean(existing) && existing.sql.includes("'PACK'::\"SharedItemType\"") && existing.params[0] === "pack-1", existing && existing.sql);
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => [packRow()]);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        const removed = await packs.unpublishPackFromFeed("900000000000000500", "pack-1");
        check("unpublishing a pack reports success", removed === true);
        check("unpublishing a pack deletes PACK posts by item", db.packRemovals.length === 1 && db.packRemovals[0].itemType === "PACK" && db.packRemovals[0].itemId === "pack-1", JSON.stringify(db.packRemovals));
        const lookup = db.find('FROM "AestheticPack" p');
        check("unpublishing a pack checks the guild first", Boolean(lookup) && lookup.params[0] === "900000000000000500");
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('FROM "AestheticPack" p', () => []);
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        await expectThrowsAsync(
            "a pack from another server cannot be unpublished",
            () => packs.unpublishPackFromFeed("900000000000000500", "pack-elsewhere"),
            "not found"
        );
        check("a refused unpublish deletes nothing", db.packRemovals.length === 0);
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('DELETE FROM "AestheticPack" p USING "Guild" g', () => [{ id: "pack-1" }], { rowCount: 1 });
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        await packs.deleteServerAestheticPack("900000000000000500", "pack-1");
        check("deleting a pack removes its Discover post", db.packRemovals.length === 1 && db.packRemovals[0].itemType === "PACK" && db.packRemovals[0].itemId === "pack-1", JSON.stringify(db.packRemovals));
        const del = db.find('DELETE FROM "AestheticPack" p USING "Guild" g');
        check("deleting a pack is guild-scoped", del && del.params[0] === "900000000000000500" && del.params[1] === "pack-1" && del.sql.includes('g."discordId" = $1'));
    }

    {
        const db = createFakeDb();
        db.packPublishes = [];
        db.packRemovals = [];
        db.on('DELETE FROM "AestheticPack" p USING "Guild" g', () => [], { rowCount: 0 });
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), packStubs(db));
        await expectThrowsAsync(
            "deleting a pack from another server fails",
            () => packs.deleteServerAestheticPack("900000000000000500", "pack-1"),
            "not found"
        );
        check("a failed pack delete does not touch SharedPost", db.packRemovals.length === 0);
    }

    section("Part 2f: the pack publish route is guild-gated and allowance-aware");

    {
        const route = sourceIncludes(APP, "api", "servers", "[id]", "packs", "[packId]", "publish", "route.ts");
        check("the pack route checks a Discord guild permission", route.includes("guardGuildAccessWithSession"));
        check("the pack route requires the bot to be installed", route.includes("isGuildInstalled"));
        check("the pack route spends the publisher's publication allowance", route.includes("COMMUNITY_PUBLISH_LIMIT"));
        check("the pack route skips the allowance on re-publish", route.includes("hasSharedItem"));
        check("the pack route spends the publisher's own crowns", route.includes("access.session.discordId"));
        check("the pack DELETE is guild-gated too", /export async function DELETE\([\s\S]*guardGuildAccessWithSession/.test(route));
        check("the pack DELETE does not require the bot to be installed", !/export async function DELETE\([\s\S]*isGuildInstalled/.test(route));
    }

    section("Part 2g: hydration turns PROFILE and PACK posts into cards");

    {
        const db = createFakeDb();
        db.on('FROM "Profile" p', (params) => {
            db.profileParams = params;
            return [{
                id: "prof-1",
                name: "Nova",
                profileSetId: "10",
                username: "nova",
                discriminator: "0001",
                pronouns: "she/her",
                bio: "hi",
                status: "online",
                symbols: ["moon"],
                palette: ["#111", "#222"],
                accentColor: "#111",
            }];
        });
        db.on('FROM "AestheticPack" p', (params) => {
            db.packParams = params;
            return [{
                id: "pack-1",
                name: "Midnight",
                description: "deep blues",
                aestheticId: "cosmic",
                moodId: "calm",
                colors: ["#0b1026", "#4f7cff"],
                symbols: ["moon"],
                guildName: "Design Hub",
                guildDiscordId: "900000000000000500",
                guildIconHash: "iconhash",
            }];
        });
        const feedItems = loadModule(path.join(LIB, "feedItems.ts"), {
            "./database": adapterOf(db),
            "./assets": ASSETS_STUB,
            "./remix": REMIX_STUB,
        });

        const posts = [
            postRow({ id: "p-prof", itemType: "PROFILE", itemId: "prof-1" }),
            postRow({ id: "p-pack", itemType: "PACK", itemId: "pack-1" }),
        ];
        const cards = await feedItems.hydrateFeedPosts(posts);
        check("both new post types hydrate", cards.length === 2, "got " + cards.length);

        // Cards are the post row spread flat with a `media` object bolted on,
        // so every presentation field lives under `.media`.
        const profileCard = cards.find((c) => c.id === "p-prof");
        const pm = profileCard && profileCard.media;
        check("the profile card hydrates its source row", pm && pm.kind === "composed", pm && pm.kind);
        check("the profile card media carries the set's pfp and banner", Boolean(pm) && pm.pfpUrl && pm.bannerUrl, JSON.stringify(pm));
        check("the profile card shows the username idea", pm && pm.usernameIdea === "nova#0001", pm && pm.usernameIdea);
        check("the profile card title is the profile name", pm && pm.title === "Nova", pm && pm.title);
        check("the profile card subtitle is the pronouns", pm && pm.subtitle === "she/her", pm && pm.subtitle);
        check("the profile card has no detail page", pm && pm.detailHref === null, "detailHref=" + (pm && pm.detailHref));
        check("the profile card is not attributed to a guild", pm && pm.guild === null);
        check("the profile card keeps its post fields", profileCard && profileCard.caption === "fresh look" && profileCard.authorDiscordId === "900000000000000911", JSON.stringify(profileCard && [profileCard.caption, profileCard.authorDiscordId]));
        check("the profile lookup is a single ANY($1) query", db.count('FROM "Profile" p') === 1 && Array.isArray(db.profileParams) && Array.isArray(db.profileParams[0]) && db.profileParams[0].includes("prof-1"), JSON.stringify(db.profileParams));

        const packCard = cards.find((c) => c.id === "p-pack");
        const gm = packCard && packCard.media;
        check("the pack card hydrates its source row", gm && gm.kind === "pack", gm && gm.kind);
        check("the pack card uses the pack colours as its palette", gm && JSON.stringify(gm.palette) === JSON.stringify(["#0b1026", "#4f7cff"]), JSON.stringify(gm && gm.palette));
        check("the pack card accent is the first colour", gm && gm.accentColor === "#0b1026", gm && gm.accentColor);
        check("the pack card title is the pack name", gm && gm.title === "Midnight", gm && gm.title);
        check("the pack card subtitle is the pack description", gm && gm.subtitle === "deep blues", gm && gm.subtitle);
        check("the pack card has no detail page", gm && gm.detailHref === null);
        check("the pack card shows the server name", gm && gm.guild && gm.guild.name === "Design Hub", JSON.stringify(gm && gm.guild));
        check("the pack card shows the server icon", gm && gm.guild && String(gm.guild.iconUrl).includes("900000000000000500/iconhash"), JSON.stringify(gm && gm.guild));
        check("the pack card credits the server, not the member", gm && gm.guild !== null && gm.pfpUrl === null && gm.bannerUrl === null, JSON.stringify(gm && [gm.pfpUrl, gm.bannerUrl]));
        check("the pack lookup joins Guild for the card", db.find('FROM "AestheticPack" p').sql.includes('INNER JOIN "Guild" g'));
        check("the pack lookup is a single ANY($1) query", db.count('FROM "AestheticPack" p') === 1 && Array.isArray(db.packParams) && db.packParams[0].includes("pack-1"), JSON.stringify(db.packParams));
    }

    {
        // A deleted source row must not take the whole feed down with it. The
        // post survives with null media and the card renders its "content no
        // longer exists" fallback, so the feed keeps its shape.
        const db = createFakeDb();
        db.on('FROM "Profile" p', () => []);
        db.on('FROM "AestheticPack" p', () => []);
        const feedItems = loadModule(path.join(LIB, "feedItems.ts"), {
            "./database": adapterOf(db),
            "./assets": ASSETS_STUB,
            "./remix": REMIX_STUB,
        });
        const cards = await feedItems.hydrateFeedPosts([
            postRow({ id: "p-prof", itemType: "PROFILE", itemId: "gone" }),
            postRow({ id: "p-pack", itemType: "PACK", itemId: "gone" }),
            postRow({ id: "p-unknown", itemType: "ASSET", itemId: "10" }),
        ]);
        check("a deleted source row leaves the post in place", cards.length === 3, "got " + cards.length);
        check("a deleted profile hydrates to null media", cards.find((c) => c.id === "p-prof").media === null);
        check("a deleted pack hydrates to null media", cards.find((c) => c.id === "p-pack").media === null);
        check("a surviving post still hydrates", cards.find((c) => c.id === "p-unknown").media !== null);
    }

    {
        // A pack whose guild row is missing still renders (guild name falls back).
        const db = createFakeDb();
        db.on('FROM "AestheticPack" p', () => [{
            id: "pack-1", name: "Midnight", description: null, aestheticId: null, moodId: null,
            colors: [], symbols: [], guildName: null, guildDiscordId: null, guildIconHash: null,
        }]);
        const feedItems = loadModule(path.join(LIB, "feedItems.ts"), {
            "./database": adapterOf(db),
            "./assets": ASSETS_STUB,
            "./remix": REMIX_STUB,
        });
        const cards = await feedItems.hydrateFeedPosts([postRow({ itemType: "PACK", itemId: "pack-1" })]);
        check("a pack with no guild still renders", cards.length === 1, "got " + cards.length);
        check("a pack with no guild falls back to a generic label", cards[0] && cards[0].media && cards[0].media.guild && cards[0].media.guild.name === "a Discord server", JSON.stringify(cards[0] && cards[0].media && cards[0].media.guild));
        check("a pack with no icon has a null icon url", cards[0] && cards[0].media && cards[0].media.guild && cards[0].media.guild.iconUrl === null);
        check("a pack with no colours has a null accent", cards[0] && cards[0].media && cards[0].media.accentColor === null);
        check("a pack with no description has a null subtitle", cards[0] && cards[0].media && cards[0].media.subtitle === null, JSON.stringify(cards[0] && cards[0].media && cards[0].media.subtitle));
    }

    {
        // A composed profile with no custom username must not render "#null".
        const db = createFakeDb();
        db.on('FROM "Profile" p', () => [{
            id: "prof-2", name: "Quiet", profileSetId: null, username: null, discriminator: null,
            pronouns: null, bio: "just a bio", status: null, symbols: [], palette: [], accentColor: null,
        }]);
        const feedItems = loadModule(path.join(LIB, "feedItems.ts"), {
            "./database": adapterOf(db),
            "./assets": ASSETS_STUB,
            "./remix": REMIX_STUB,
        });
        const cards = await feedItems.hydrateFeedPosts([postRow({ itemType: "PROFILE", itemId: "prof-2" })]);
        check("a profile without a username has no handle line", cards.length === 1 && cards[0].media.usernameIdea === null, JSON.stringify(cards[0] && cards[0].media.usernameIdea));
        check("a profile without pronouns falls back to its bio", cards[0] && cards[0].media && cards[0].media.subtitle === "just a bio", JSON.stringify(cards[0] && cards[0].media && cards[0].media.subtitle));
    }

    section("Part 2h: the feed card renders both new kinds");

    {
        const card = sourceIncludes(APP, "..", "components", "feed", "FeedCard.tsx");
        check("FeedCard renders a dedicated pack block", card.includes('media.kind === "pack"'));
        check("FeedCard renders profile art on the shared banner surface", card.includes('media.kind !== "palette"'));
        check("FeedCard keeps palette cards on their own surface", card.includes('media.kind === "palette"'));
        check("FeedCard explains a post whose content was deleted", card.includes("no longer exists"));
        check("FeedCard credits the server on a pack card", card.includes("media.guild"));
        check("FeedCard renders the server icon when it has one", card.includes("media.guild.iconUrl"));
        // Both new kinds publish without a detail page, so the card must not
        // emit an empty anchor for them.
        check("FeedCard only links the media when a detail page exists", card.includes("media?.detailHref &&") || card.includes("if (detailHref)"));
        check("FeedCard shows the pack palette swatches", /media\.kind === "pack"[\s\S]{0,2000}media\.palette/.test(card));
        check("FeedCard shows the pack symbols", /media\.kind === "pack"[\s\S]{0,1200}media\.symbols/.test(card));
    }

    section("Part 2i: Discover search finds profiles and packs");

    function feedSearchModule(db) {
        // The real catalogue is loaded so that the asset-set id matching runs
        // against genuine data rather than a stub shape.
        return loadModule(path.join(LIB, "feedSearch.ts"), {
            "./database": adapterOf(db),
        });
    }

    {
        const db = createFakeDb();
        const feedSearch = feedSearchModule(db);

        const built = feedSearch.buildFeedSearchQuery("nova", "900000000000000911", {});
        const sql = squash(built.text);
        check("the search query joins Profile", sql.includes('LEFT JOIN "Profile" pr'));
        check("the search query joins AestheticPack", sql.includes('LEFT JOIN "AestheticPack" apk'));
        check("the Profile join is guarded by itemType PROFILE", /LEFT JOIN "Profile" pr ON sp\."itemType" = 'PROFILE'/.test(sql), sql.slice(0, 400));
        check("the pack join is guarded by itemType PACK", /LEFT JOIN "AestheticPack" apk ON sp\."itemType" = 'PACK'/.test(sql));
        check("the search query keeps the existing joins", sql.includes('LEFT JOIN "SavedAesthetic" sa') && sql.includes('LEFT JOIN "SavedPalette" spal'));

        const match = squash(feedSearch.FEED_SEARCH_MATCH_SQL);
        check("the PROFILE branch is guarded by pr.id IS NOT NULL", /pr\.id IS NOT NULL/.test(match));
        check("the PROFILE branch searches the profile name", /pr\.name ILIKE \$2/.test(match));
        check("the PROFILE branch searches the custom username", /pr\.username ILIKE \$2/.test(match));
        check("the PROFILE branch searches the bio", /pr\.bio ILIKE \$2/.test(match));
        check("the PROFILE branch matches a catalogue set id", /pr\."profileSetId" = ANY\(\$3::text\[\]\)/.test(match));
        check("the PACK branch is guarded by apk.id IS NOT NULL", /apk\.id IS NOT NULL/.test(match));
        check("the PACK branch searches the pack name", /apk\.name ILIKE \$2/.test(match));
        check("the PACK branch searches the pack description", /apk\.description ILIKE \$2/.test(match));
        check("the PACK branch searches the pack colours", /unnest\(apk\.colors\)/.test(match));
        check("every type branch is guarded", (match.match(/IS NOT NULL/g) || []).length >= 4, "found " + (match.match(/IS NOT NULL/g) || []).length);

        const typeQuery = feedSearch.buildFeedSearchQuery("nova", "900000000000000911", { itemType: "PACK" });
        check("an itemType filter is parameterised and cast", typeQuery.text.includes('$4::"SharedItemType"') && typeQuery.params[3] === "PACK", JSON.stringify(typeQuery.params));
        const tagQuery = feedSearch.buildFeedSearchQuery("nova", "900000000000000911", { tag: "#Dark" });
        check("a tag filter is parameterised and normalised", /\$4\s*=\s*ANY\(sp\.tags\)/.test(squash(tagQuery.text)) && tagQuery.params[3] === "dark", JSON.stringify(tagQuery.params));
        const popular = feedSearch.buildFeedSearchQuery("nova", "900000000000000911", { sort: "popular" });
        check("sorting by popular orders on likeCount", popular.text.includes('ORDER BY sp."likeCount" DESC'));
        const latest = feedSearch.buildFeedSearchQuery("nova", "900000000000000911", {});
        check("the default sort is newest first", latest.text.includes('ORDER BY sp."createdAt" DESC') && !latest.text.includes('ORDER BY sp."likeCount" DESC'));
        check("the limit is parameterised", /LIMIT \$\d+/.test(squash(latest.text)));
        check("the limit is clamped to 60", feedSearch.buildFeedSearchQuery("ab", "900000000000000911", { limit: 9999 }).params[3] === 60, JSON.stringify(feedSearch.buildFeedSearchQuery("ab", "900000000000000911", { limit: 9999 }).params));
        check("the limit floor is 1", feedSearch.buildFeedSearchQuery("ab", "900000000000000911", { limit: 0 }).params[3] === 1);

        check("a short term is rejected", feedSearch.normalizeFeedSearchTerm("a") === null);
        check("an over-long term is truncated, not rejected", feedSearch.normalizeFeedSearchTerm("x".repeat(65)) === "x".repeat(64));
        check("a valid term is trimmed", feedSearch.normalizeFeedSearchTerm("  Nova  ") === "Nova");

        const escapedQuery = feedSearch.buildFeedSearchQuery("50%_off", "900000000000000911", {});
        const pattern = escapedQuery.params[1];
        check("LIKE wildcards in the term are escaped", pattern === "%50\\%\\_off%", JSON.stringify(pattern));
        check("the escaped pattern travels only as a parameter", !squash(escapedQuery.text).includes("50"), squash(escapedQuery.text).slice(0, 200));
        check("the term is never interpolated into the SQL", !/ILIKE\s+'/.test(squash(escapedQuery.text)), "found an interpolated ILIKE literal");

        const assetTerm = feedSearch.buildFeedSearchQuery("10", "900000000000000911", {});
        check("a catalogue set id is resolved into the asset-id parameter", assetTerm.params[2].includes("10"), JSON.stringify(assetTerm.params[2]));

        /*
         * "My posts" reuses this query rather than a second one, so the author
         * filter must be parameterised like every other filter and must not
         * shift the positions the checks above depend on when it is absent.
         */
        const mineQuery = feedSearch.buildFeedSearchQuery("nova", "900000000000000911", { authorDiscordId: "900000000000000911" });
        check("an author filter is parameterised", /AND u\."discordId" = \$4/.test(squash(mineQuery.text)), squash(mineQuery.text).slice(0, 400));
        check("the author filter travels only as a parameter", !squash(mineQuery.text).includes("900000000000000911"));
        check("an author filter combines with the type filter", squash(feedSearch.buildFeedSearchQuery("nova", null, { authorDiscordId: "9", itemType: "PALETTE" }).text).includes('AND u."discordId" = $4 AND sp."itemType" = $5'));
        check("no author filter leaves the parameter layout untouched", feedSearch.buildFeedSearchQuery("nova", "9", { authorDiscordId: null }).params[3] === 18, JSON.stringify(feedSearch.buildFeedSearchQuery("nova", "9", { authorDiscordId: null }).params));
    }

    {
        const db = createFakeDb();
        db.on('FROM "User" u', () => [{ discordId: "900000000000000911", username: "nova", displayName: "Nova", avatarHash: null, postCount: 4 }]);
        const feedSearch = feedSearchModule(db);
        const rows = await feedSearch.searchFeedCreators("nova", 5);
        check("creator search returns rows", Array.isArray(rows) && rows.length === 1);
        const call = db.find('FROM "User" u');
        check("creator search matches tags through the post", call && call.sql.includes("unnest(sp.tags)"));
        check("creator search is limited by a parameter", /LIMIT \$2/.test(squash(call.sql)) && call.params[1] === 5, JSON.stringify(call.params));
        const empty = await feedSearch.searchFeedPosts("a", "900000000000000911", {});
        check("a too-short search term issues no query and returns nothing", Array.isArray(empty) && empty.length === 0 && db.count('LEFT JOIN "Profile" pr') === 0);
    }

    section("Part 2j: the Discover page and feed route expose both types");

    {
        const discover = sourceIncludes(APP, "dashboard", "discover", "page.tsx");
        const filters = /const FILTER[^=]*=[\s\S]*?\];/.exec(discover);
        check("Discover declares a filter chip list", Boolean(filters));
        const chipBody = filters ? filters[0] : "";
        check("Discover offers a PROFILE filter", /value:\s*"PROFILE"/.test(chipBody), chipBody.replace(/\s+/g, " "));
        check("Discover offers a PACK filter", /value:\s*"PACK"/.test(chipBody));
        check("Discover keeps the AESTHETIC filter", /value:\s*"AESTHETIC"/.test(chipBody));
        check("Discover keeps the PALETTE filter", /value:\s*"PALETTE"/.test(chipBody));
        check("Discover keeps the ASSET filter", /value:\s*"ASSET"/.test(chipBody));
        check("Discover keeps an All filter", /value:\s*null/.test(chipBody));
        check("no chip label collides with another type's name", (chipBody.match(/label:\s*"([^"]+)"/g) || []).length === new Set((chipBody.match(/label:\s*"([^"]+)"/g) || [])).size);
        check("Discover names the AESTHETIC chip apart from PROFILE", /label:\s*"Aesthetics",\s*value:\s*"AESTHETIC"/.test(chipBody), chipBody.replace(/\s+/g, " "));
        check("Discover explains the chip rename", discover.includes("Profile Builder") || discover.includes("SHARED_ITEM_LABELS"));
    }

    {
        // Discover is a server component: it calls the search lib directly
        // rather than round-tripping an API route, so the type filter, sort and
        // tag all have to reach `searchFeedPosts`.
        const discover = sourceIncludes(APP, "dashboard", "discover", "page.tsx");
        check("Discover validates the type param against the shared list", discover.includes("isSharedItemType"));
        check("Discover imports the feed search lib", /from "\.\.\/\.\.\/\.\.\/lib\/feedSearch"/.test(discover));
        check("Discover calls searchFeedPosts", discover.includes("searchFeedPosts("));
        check("Discover calls searchFeedCreators", discover.includes("searchFeedCreators("));
        const call = /searchFeedPosts\([\s\S]{0,400}?\)/.exec(discover);
        const callText = call ? squash(call[0]) : "";
        check("search receives the item type filter", callText.includes("itemType"), callText);
        check("search receives the tag filter", callText.includes("tag"), callText);
        check("search receives the sort", callText.includes("sort"), callText);
        check("Discover understands the popular sort", discover.includes('"popular"'));
        check("Discover normalises the term before searching", discover.includes("normalizeFeedSearchTerm"));
        check("Discover hydrates the search results into cards", discover.includes("hydrateFeedPosts"));

        /*
         * "My posts" is a filter on this page, not a second route, so both data
         * sources have to receive the author or the chip would silently show
         * the whole feed while reading as active.
         */
        check("Discover reads a mine param", /raw\.mine\s*===\s*"1"/.test(discover));
        check("Discover only honours mine when signed in", /viewerDiscordId\s*!==\s*null/.test(discover));
        check("search receives the author filter", /searchFeedPosts\([\s\S]{0,500}?authorDiscordId/.test(discover));
        check("the browse query receives the author filter", /getFeedPosts\([\s\S]{0,500}?authorDiscordId/.test(discover));
        check("the search form preserves the mine filter", /name="mine"/.test(discover));
    }

    {
        const feedRoute = sourceIncludes(APP, "api", "feed", "route.ts");
        check("the publish route validates itemType against the shared list", feedRoute.includes("isSharedItemType"));
        check("the publish route stores the itemType", /itemType,/.test(feedRoute));
        check("the publish route stores tags", /tags/.test(feedRoute));
    }

    section("Part 2k: creator profiles count both new types");

    {
        const db = createFakeDb();
        db.on('FROM "User" u', () => [{
            discordId: "900000000000000911",
            username: "nova",
            displayName: "Nova",
            avatarHash: null,
            joinedAt: new Date("2025-01-01T00:00:00Z"),
            postCount: 4,
            profileCount: 1,
            composedProfileCount: 2,
            paletteCount: 1,
            assetSetCount: 1,
            packCount: 3,
            likesReceived: 10,
            commentsReceived: 2,
            remixesReceived: 1,
        }]);
        const creator = loadModule(path.join(LIB, "creator.ts"), { "./database": adapterOf(db) });
        const profile = await creator.getCreatorProfile("900000000000000911");
        check("the creator profile is returned", profile && profile.discordId === "900000000000000911");
        check("the creator profile counts composed profiles", profile && profile.composedProfileCount === 2, "composedProfileCount=" + (profile && profile.composedProfileCount));
        check("the creator profile counts packs", profile && profile.packCount === 3, "packCount=" + (profile && profile.packCount));
        const call = db.find('FROM "User" u');
        check("the composed-profile count filters on itemType PROFILE", call.sql.includes("sp.\"itemType\" = 'PROFILE'"));
        check("the pack count filters on itemType PACK", call.sql.includes("sp.\"itemType\" = 'PACK'"));
        check("the counts are computed in one query", db.count('FROM "User" u') === 1, "ran " + db.count('FROM "User" u'));
        check("every count is cast to int so pg returns a number", (call.sql.match(/::int AS/g) || []).length >= 9, "found " + (call.sql.match(/::int AS/g) || []).length);
        const missing = await creator.getCreatorProfile("not-a-discord-id");
        check("an invalid creator id returns no profile", missing === null);
        check("an invalid creator id issues no query", db.count('FROM "User" u') === 1);
    }

    section("Part 2l: publishing earns crowns exactly once per item");

    {
        const db = crownDb();
        const crownEarning = crownEarningModule(db);
        const rule = crownEarning.CROWN_EARN_RULES && crownEarning.CROWN_EARN_RULES.publish;
        check("a publish crown rule exists", Boolean(rule));
        check("the publish rule is keyed on source 'publish'", rule && rule.source === "publish");
        check("the publish rule has a positive amount", Boolean(rule) && rule.amount > 0);
        check("the publish rule has a daily cap", Boolean(rule) && rule.dailyCap > 0);

        await crownEarning.awardForPublish("900000000000000911", "PROFILE", "prof-1");
        const insert = db.find('INSERT INTO "CrownTransaction"');
        check("publishing writes a crown ledger row", Boolean(insert), "no INSERT executed");
        check("the ledger row is an EARN", insert && insert.sql.includes("'EARN'"));
        check("the ledger row pays the rule amount", insert && insert.params[2] === rule.amount, JSON.stringify(insert && insert.params));
        check("the ledger row records the publish source", insert && insert.params[4] === "publish", JSON.stringify(insert && insert.params));
        check("the ledger row carries the item-keyed idempotency key", insert && insert.params[5] === "publish:PROFILE:prof-1", JSON.stringify(insert && insert.params));
        const totals = db.crownTotals;
        check("the reward is attributed to the resolved user row", totals && totals[0] === "user-row-1", JSON.stringify(totals));
        check("the cap is measured on the publish source only", totals && totals[1] === "publish", JSON.stringify(totals));
    }

    {
        // The key is the item, not the post row: unshare-then-re-share must
        // not be a way to collect the award again.
        const db = crownDb();
        const crownEarning = crownEarningModule(db);
        await crownEarning.awardForPublish("900000000000000911", "PACK", "pack-1");
        const packKey = db.find('INSERT INTO "CrownTransaction"').params[5];
        check("a pack publish earns under a PACK-scoped key", packKey === "publish:PACK:pack-1", packKey);
        check("the same item never earns under two different keys", db.count('INSERT INTO "CrownTransaction"') === 1);
    }

    {
        // The per-source daily cap must be enforced.
        const db = crownDb({ sourceCount: 99 });
        const crownEarning = crownEarningModule(db);
        await crownEarning.awardForPublish("900000000000000911", "PACK", "pack-1");
        check("the daily publish crown cap is enforced", db.count('INSERT INTO "CrownTransaction"') === 0, "an award was written past the cap");
    }

    {
        // The global daily earning cap must also stop a publish award.
        const db = crownDb({ totalAmount: 999 });
        const crownEarning = crownEarningModule(db);
        await crownEarning.awardForPublish("900000000000000911", "PACK", "pack-2");
        check("the overall daily crown cap is enforced", db.count('INSERT INTO "CrownTransaction"') === 0, "an award was written past the total cap");
    }

    {
        // The fast path must short-circuit a repeat award before taking a lock.
        const db = crownDb({ alreadyAwarded: true });
        db.forbid("FOR UPDATE");
        const crownEarning = crownEarningModule(db);
        await crownEarning.awardForPublish("900000000000000911", "PACK", "pack-1");
        check("a repeat award for the same item writes nothing", db.count('INSERT INTO "CrownTransaction"') === 0);
    }

    {
        // An unknown account must not be paid.
        const db = crownDb({ unknownUser: true });
        const crownEarning = crownEarningModule(db);
        await crownEarning.awardForPublish("900000000000000911", "PROFILE", "prof-1");
        check("an award for an unknown account writes no ledger row", db.count('INSERT INTO "CrownTransaction"') === 0);
    }

    {
        const db = createFakeDb();
        const crownEarning = crownEarningModule(db);
        await crownEarning.awardForPublish("900000000000000911", "", "prof-1");
        await crownEarning.awardForPublish("900000000000000911", "PROFILE", "");
        check("an award with a blank item type or id is skipped", db.count('FROM "CrownTransaction"') === 0, "ran " + db.count('FROM "CrownTransaction"'));
    }

    section("Part 2m: the Studio publishes both types");

    {
        // Profiles publish through the shared ShareToFeedButton, mounted by the
        // profile workspace. PACK is deliberately excluded from that button
        // because a pack publishes through its guild-scoped route instead.
        const button = sourceIncludes(STUDIO, "components", "feed", "ShareToFeedButton.tsx");
        check("the share button posts to the feed API", button.includes("/api/feed"));
        check("the share button sends the itemType", /\bitemType\b/.test(button));
        check("the share button sends tags", /\btags\b/.test(button));
        check("the share button excludes PACK from its prop type", !/itemType:\s*"[^"]*PACK"/.test(button), "PACK should not be a ShareToFeedButton type");

        const workspace = sourceIncludes(STUDIO, "components", "profile", "ProfileWorkspace.tsx");
        check("the profile workspace mounts the share button", workspace.includes("ShareToFeedButton"));
        check("the profile workspace publishes PROFILE", /itemType="PROFILE"/.test(workspace));
    }

    {
        // Server packs publish through the guild-scoped route, from the pack
        // manager, with both a publish (POST) and unpublish (DELETE) call.
        const manager = sourceIncludes(STUDIO, "components", "servers", "AestheticPackManager.tsx");
        check("the pack manager calls the guild-scoped publish route", /\/packs\/\$\{[^}]+\}\/publish/.test(manager), "no /publish call");
        check("the pack manager publishes with POST", /method:\s*"POST"/.test(manager));
        check("the pack manager unpublishes with DELETE", /method:\s*"DELETE"/.test(manager));
        check("the pack manager reads the published flag", /pack\.published/.test(manager));
    }
}

// ===========================================================================
// Part 3 — live end-to-end against Postgres
// ===========================================================================

async function partThree() {
    section("Part 3: live end-to-end against Postgres");

    let dotenv;
    try {
        dotenv = require("dotenv");
    } catch {
        skip("live checks", "dotenv is not installed");
        return;
    }
    dotenv.config({ path: path.join(ROOT, ".env") });
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        skip("live checks", "DATABASE_URL is not set");
        return;
    }

    let pg;
    try {
        pg = require(path.join(STUDIO, "node_modules", "pg"));
    } catch {
        skip("live checks", "pg is not installed under studio/node_modules");
        return;
    }

    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 8000 });
    try {
        await client.connect();
    } catch (e) {
        skip("live checks", "Postgres is unreachable: " + e.message);
        return;
    }

    const adapter = {
        query: (text, values = []) => client.query(text, values),
        withTransaction: async (fn) => {
            await client.query("BEGIN");
            try {
                const out = await fn(adapter);
                await client.query("COMMIT");
                return out;
            } catch (e) {
                await client.query("ROLLBACK");
                throw e;
            }
        },
        getPostgresAdapter: async () => adapter,
    };

    // lib/assets builds CDN urls for profile set art and throws when the
    // public bucket origin is unconfigured, which hydration needs.
    process.env.R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "https://r2.example.test";

    const discordId = "900000000000000911";
    const otherDiscordId = "900000000000000912";
    const guildDiscordId = "900000000000000500";
    const userId = "live-pub-user";
    const otherUserId = "live-pub-user-2";
    const profileId = "live-pub-profile";
    const guildId = "live-pub-guild";
    const packId = "live-pub-pack";

    const stubs = {
        "./database": adapter,
        "./apiError": apiErrorStub(),
    };

    async function cleanup() {
        const statements = [
            ['DELETE FROM "SharedPost" WHERE "itemId" = $1', [profileId]],
            ['DELETE FROM "SharedPost" WHERE "itemId" = $1', [packId]],
            ['DELETE FROM "CrownTransaction" WHERE "userId" = $1', [userId]],
            ['DELETE FROM "CrownTransaction" WHERE "userId" = $1', [otherUserId]],
            ['DELETE FROM "Profile" WHERE id = $1', [profileId]],
            ['DELETE FROM "AestheticPack" WHERE id = $1', [packId]],
            ['DELETE FROM "Guild" WHERE id = $1', [guildId]],
            ['DELETE FROM "User" WHERE id = $1', [userId]],
            ['DELETE FROM "User" WHERE id = $1', [otherUserId]],
        ];
        for (const [sql, params] of statements) {
            try { await client.query(sql, params); } catch { /* best effort */ }
        }
    }

    try {
        await cleanup();
        await client.query(
            'INSERT INTO "User" (id, "discordId", username, "displayName", "createdAt", "updatedAt", "sessionEpoch") VALUES ($1, $2, $3, $4, now(), now(), 0)',
            [userId, discordId, "livepub", "Live Pub"]
        );
        await client.query(
            'INSERT INTO "User" (id, "discordId", username, "displayName", "createdAt", "updatedAt", "sessionEpoch") VALUES ($1, $2, $3, $4, now(), now(), 0)',
            [otherUserId, otherDiscordId, "livepub2", "Live Pub Two"]
        );
        await client.query(
            'INSERT INTO "Profile" (id, "userId", name, "isActive", "profileSetId", username, pronouns, bio, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())',
            [profileId, userId, "Nova Live", true, "10", "novalive", "she/her", "live test profile"]
        );
        await client.query(
            'INSERT INTO "Guild" (id, "discordId", name, "createdAt", "updatedAt") VALUES ($1, $2, $3, now(), now())',
            [guildId, guildDiscordId, "Design Hub"]
        );
        await client.query(
            'INSERT INTO "AestheticPack" (id, "guildId", name, description, colors, symbols, enabled, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())',
            [packId, guildId, "Midnight Live", "deep blues", ["#0b1026", "#4f7cff"], ["moon"], true]
        );
        check("live fixtures were inserted", true);

        const sharedFeed = loadModule(path.join(LIB, "sharedFeed.ts"), {
            ...stubs,
            "./crownEarning": { awardForPublish: async () => undefined, awardForRemix: async () => undefined },
            "./notifications": NOTIFICATIONS_STUB,
        });
        const packs = loadModule(path.join(LIB, "aestheticPacks.ts"), { ...stubs, "./sharedFeed": sharedFeed });
        const feedItems = loadModule(path.join(LIB, "feedItems.ts"), stubs);
        const feedSearch = loadModule(path.join(LIB, "feedSearch.ts"), stubs);
        const creator = loadModule(path.join(LIB, "creator.ts"), stubs);

        // --- PROFILE round trip
        const profilePost = await sharedFeed.shareItemToFeed(discordId, { itemType: "PROFILE", itemId: profileId, caption: "live profile", tags: ["#Live", "live"] });
        check("a composed profile publishes to the live database", profilePost && profilePost.itemType === "PROFILE" && profilePost.itemId === profileId, JSON.stringify(profilePost));
        check("the live post stores normalised tags", profilePost && JSON.stringify(profilePost.tags) === JSON.stringify(["live"]), JSON.stringify(profilePost && profilePost.tags));
        check("the live post reports its author", profilePost && profilePost.authorDiscordId === discordId, JSON.stringify(profilePost && profilePost.authorDiscordId));

        const again = await sharedFeed.shareItemToFeed(discordId, { itemType: "PROFILE", itemId: profileId, caption: "edited caption", tags: ["live"] });
        check("re-publishing the same profile reuses the post", again && again.id === profilePost.id, again && again.id + " vs " + profilePost.id);
        check("re-publishing refreshes the caption", again && again.caption === "edited caption", again && again.caption);
        const postCount = await client.query('SELECT COUNT(*)::int AS n FROM "SharedPost" WHERE "itemType" = $1 AND "itemId" = $2', ["PROFILE", profileId]);
        check("only one post exists per profile", Number(postCount.rows[0].n) === 1, "n=" + postCount.rows[0].n);

        await expectThrowsAsync(
            "another member cannot publish that profile",
            () => sharedFeed.shareItemToFeed(otherDiscordId, { itemType: "PROFILE", itemId: profileId }),
            "only publish something of your own"
        );

        // --- PACK round trip
        const packPost = await packs.publishPackToFeed(guildDiscordId, discordId, packId, "live pack");
        check("a server pack publishes to the live database", packPost && packPost.itemType === "PACK" && packPost.itemId === packId, JSON.stringify(packPost));
        await expectThrowsAsync(
            "a pack cannot be published from the wrong server",
            () => packs.publishPackToFeed("900000000000000501", discordId, packId),
            "not found"
        );
        await expectThrowsAsync(
            "PACK is rejected by the generic publish path",
            () => sharedFeed.shareItemToFeed(discordId, { itemType: "PACK", itemId: packId }),
            "published from Server Studio"
        );

        // --- hydration
        const cards = await feedItems.hydrateFeedPosts([profilePost, packPost]);
        check("both live posts hydrate into cards", cards.length === 2, "got " + cards.length);
        const liveProfile = cards.find((c) => c.itemType === "PROFILE");
        const livePack = cards.find((c) => c.itemType === "PACK");
        check("the live profile card carries the profile row", liveProfile && liveProfile.media && liveProfile.media.title === "Nova Live", JSON.stringify(liveProfile && liveProfile.media));
        check("the live profile card has no detail page", liveProfile && liveProfile.media && liveProfile.media.detailHref === null);
        check("the live pack card carries the guild", livePack && livePack.media && livePack.media.guild && livePack.media.guild.name === "Design Hub", JSON.stringify(livePack && livePack.media && livePack.media.guild));

        // --- search
        const byProfileName = await feedSearch.searchFeedPosts("Nova Live", discordId, { itemType: "PROFILE" });
        check("search finds the profile by name", byProfileName.some((p) => p.id === profilePost.id), "found " + byProfileName.length);
        const byPackName = await feedSearch.searchFeedPosts("Midnight Live", discordId, { itemType: "PACK" });
        check("search finds the pack by name", byPackName.some((p) => p.id === packPost.id), "found " + byPackName.length);
        const byColour = await feedSearch.searchFeedPosts("0b1026", discordId, { itemType: "PACK" });
        check("search finds the pack by colour", byColour.some((p) => p.id === packPost.id), "found " + byColour.length);
        const byCaption = await feedSearch.searchFeedPosts("live pack", discordId, {});
        check("search finds a post by caption", byCaption.some((p) => p.id === packPost.id), "found " + byCaption.length);
        const byTag = await feedSearch.searchFeedPosts("live", discordId, { tag: "live" });
        check("search filters by tag", byTag.some((p) => p.id === profilePost.id), "found " + byTag.length);
        const wrongType = await feedSearch.searchFeedPosts("Nova Live", discordId, { itemType: "PACK" });
        check("the itemType filter excludes other types", !wrongType.some((p) => p.id === profilePost.id), "found " + wrongType.length);
        const popular = await feedSearch.searchFeedPosts("Nova Live", discordId, { sort: "popular" });
        check("sorting by popular runs", Array.isArray(popular));
        const creators = await feedSearch.searchFeedCreators("livepub", 5);
        check("creator search finds the author", creators.some((c) => c.discordId === discordId), JSON.stringify(creators));

        // --- creator counts
        const liveCreator = await creator.getCreatorProfile(discordId);
        check("the creator profile counts the composed profile", liveCreator && liveCreator.composedProfileCount >= 1, "composedProfileCount=" + (liveCreator && liveCreator.composedProfileCount));
        check("the creator profile counts the pack", liveCreator && liveCreator.packCount >= 1, "packCount=" + (liveCreator && liveCreator.packCount));
        check("the creator counts are numbers", liveCreator && typeof liveCreator.packCount === "number" && typeof liveCreator.composedProfileCount === "number");

        // --- crowns
        const crownEarning = loadModule(path.join(LIB, "crownEarning.ts"), crownStubs(adapter));
        await crownEarning.awardForPublish(discordId, "PROFILE", profileId);
        await crownEarning.awardForPublish(discordId, "PROFILE", profileId);
        const ledger = await client.query('SELECT COUNT(*)::int AS n FROM "CrownTransaction" WHERE "userId" = $1 AND source = $2', [userId, "publish"]);
        check("publishing earns crowns", Number(ledger.rows[0].n) >= 1, "n=" + ledger.rows[0].n);
        check("publishing the same item twice earns nothing extra", Number(ledger.rows[0].n) === 1, "n=" + ledger.rows[0].n);

        // --- removal
        const removedPack = await packs.unpublishPackFromFeed(guildDiscordId, packId);
        check("unpublishing a pack removes the live post", removedPack === true);
        const packGone = await client.query('SELECT COUNT(*)::int AS n FROM "SharedPost" WHERE "itemType" = $1 AND "itemId" = $2', ["PACK", packId]);
        check("the pack post is gone", Number(packGone.rows[0].n) === 0, "n=" + packGone.rows[0].n);

        await sharedFeed.unshareItemById(profilePost.id, discordId);
        const profileGone = await client.query('SELECT COUNT(*)::int AS n FROM "SharedPost" WHERE id = $1', [profilePost.id]);
        check("unsharing a profile post removes it", Number(profileGone.rows[0].n) === 0, "n=" + profileGone.rows[0].n);

        await packs.deleteServerAestheticPack(guildDiscordId, packId);
        const stillThere = await client.query('SELECT id FROM "AestheticPack" WHERE id = $1', [packId]);
        check("deleting a pack removes the pack", stillThere.rowCount === 0);

        // --- the chip indexes actually exist in the applied schema
        const indexes = await client.query(
            'SELECT indexdef FROM pg_indexes WHERE tablename = $1',
            ["SharedPost"]
        );
        const defs = indexes.rows.map((r) => r.indexdef.replace(/\s+/g, " ").toLowerCase());
        for (const [name, cols] of [
            ["SharedPost_itemType_createdAt_idx", '("itemtype", "createdat")'],
            ["SharedPost_itemType_likeCount_createdAt_idx", '("itemtype", "likecount", "createdat")'],
        ]) {
            const hit = defs.find((d) => d.includes(name.toLowerCase()));
            check("the database has " + name, Boolean(hit), hit || "missing");
            check(name + " covers " + cols, Boolean(hit) && hit.includes(cols), hit || "missing");
        }

        // Prove the index serves the sorted query rather than merely existing:
        // with sequential scans disabled the planner must reach for it and,
        // because itemType is the leading key, return rows already ordered so
        // no Sort node appears. A dev table is too small for the planner to
        // choose an index scan on cost alone, hence the override.
        await client.query("SET enable_seqscan = off");
        try {
            const plan = await client.query(
                'EXPLAIN SELECT sp.id FROM "SharedPost" sp WHERE sp."itemType" = $1::"SharedItemType" ORDER BY sp."createdAt" DESC LIMIT 18',
                ["PACK"]
            );
            const text = plan.rows.map((r) => r["QUERY PLAN"]).join("\n");
            check(
                "a filtered recent query scans the itemType index",
                /SharedPost_itemType_createdAt_idx/.test(text),
                text.replace(/\s+/g, " ")
            );
            check(
                "a filtered recent query needs no separate sort",
                !/^\s*->\s*Sort/m.test(text),
                text.replace(/\s+/g, " ")
            );
        } finally {
            await client.query("SET enable_seqscan = on");
        }
    } catch (e) {
        check("live end-to-end run completed", false, e && (e.stack || e.message));
    } finally {
        try { await cleanup(); } catch { /* ignore */ }
        try { await client.end(); } catch { /* ignore */ }
    }
}

// ===========================================================================
// Part 4 — type-check
// ===========================================================================

function partFour() {
    section("Part 4: type-check");

    try {
        // Run the compiler through node directly: spawning `npx.cmd` from
        // node raises EINVAL on Windows, and the local TypeScript install is
        // already resolved under studio/node_modules.
        const tscBin = path.join(STUDIO, "node_modules", "typescript", "bin", "tsc");
        execFileSync(process.execPath, [tscBin, "--noEmit"], {
            cwd: STUDIO,
            stdio: "pipe",
            encoding: "utf8",
            timeout: 900000,
            env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
        });
        check("tsc --noEmit is clean", true);
    } catch (e) {
        const out = String((e && e.stdout) || "") + String((e && e.stderr) || "");
        check("tsc --noEmit is clean", false, out.split("\n").slice(0, 10).join(" | "));
    }
}

// ===========================================================================

async function main() {
    console.log("\u001b[1mPublish Profiles + Aesthetic Packs to Discover — verification\u001b[0m");
    partOne();
    await partTwo();
    await partThree();
    partFour();

    console.log("\n" + "=".repeat(60));
    console.log("  \u001b[32m" + passed + " passed\u001b[0m  \u001b[31m" + failed + " failed\u001b[0m  \u001b[33m" + skipped + " skipped\u001b[0m");
    if (failed) {
        console.log("\n  failures:");
        for (const f of failures) console.log("    - " + f);
    }
    console.log("=".repeat(60));
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

