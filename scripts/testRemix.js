#!/usr/bin/env node
/**
 * Verification for remixing with attribution: `studio/lib/remix.ts`.
 *
 * A remix is the one feature that writes into someone else's library on the
 * strength of a post id taken from a URL, and the only place provenance is
 * recorded. The things most likely to be wrong are exactly the things a
 * reviewer cannot see in the UI: whether the copy carries both provenance
 * columns, whether the credit survives the source post being unshared, and
 * whether the Crown award can be farmed.
 *
 * The real module is transpiled with the Studio's own esbuild, so the shipped
 * SQL is what gets asserted.
 *
 * Asserted behavior:
 *
 *   1. Only AESTHETIC and PALETTE posts are remixable; ASSET is refused.
 *   2. Self-remix is refused before anything is written.
 *   3. The copy always carries `remixedFromPostId` *and* `remixedFromUserId`,
 *      bound as parameters, with both timestamps written.
 *   4. A premium set behind the artwork is refused unless the caller says the
 *      entitlement is unlocked.
 *   5. Attribution is resolved through the author id, so unsharing the source
 *      post removes the link but not the credit.
 *   6. The remix award is keyed so repeat remixes cannot pay twice.
 *
 * The database section is skipped, not failed, when no database is reachable.
 *
 * Usage: node scripts/testRemix.js
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

const REMIX_PATH = path.join(ROOT, "studio", "lib", "remix.ts");

const CREATOR_PATH = path.join(ROOT, "studio", "lib", "creator.ts");

const SHARED_FEED_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "sharedFeed.ts"
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
 * Compiles a Studio module to CommonJS and evaluates it. `stubRequire` maps a
 * bare specifier to a fake export; relative specifiers resolve to sibling
 * `.ts` files (or `.json`) and load the same way.
 */
function loadModule(modulePath, stubRequire = {}) {
    /*
     * `apiError` imports `next/server`, which only exists inside the Next
     * build. Nothing below uses the response helpers.
     */
    const stubs = {
        "next/server": {
            NextResponse: {
                json: () => ({}),
            },
        },
        ...stubRequire,
    };

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
        if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
            return stubs[specifier];
        }

        if (specifier.startsWith(".")) {
            const base = path.resolve(
                path.dirname(modulePath),
                specifier
            );

            if (
                base.endsWith(".json") &&
                fs.existsSync(base)
            ) {
                return JSON.parse(
                    fs.readFileSync(base, "utf8")
                );
            }

            for (const candidate of [
                `${base}.ts`,
                path.join(base, "index.ts"),
            ]) {
                if (fs.existsSync(candidate)) {
                    return loadModule(candidate, stubs);
                }
            }
        }

        throw new Error(
            `testRemix: cannot resolve "${specifier}" ` +
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
 * Statement patterns, ordered most-specific-first. Several of these queries
 * share a FROM clause, so the distinctive one has to be tested before the
 * generic one: the attribution query also starts `FROM "SharedPost" sp INNER
 * JOIN "SavedAesthetic" sa`, and `loadRemixablePost` matches anything joining
 * SharedPost to User.
 */
const SQL = {
    attribution:
        /FROM "SharedPost" sp\s+INNER JOIN "SavedAesthetic" sa[\s\S]*INNER JOIN "User" su/,
    insertAesthetic: /INSERT INTO "SavedAesthetic"/,
    insertPalette: /INSERT INTO "SavedPalette"/,
    sourceAesthetic:
        /FROM "SavedAesthetic" sa\s+INNER JOIN "User" u/,
    sourcePalette:
        /FROM "SavedPalette" sp\s+INNER JOIN "User" u/,
    premiumSet:
        /SELECT sa\."profileSetId"\s+FROM "SharedPost" sp/,
    actorName:
        /COALESCE\("displayName", "username"\)\s+AS name\s+FROM "User"/,
    loadPost: /FROM "SharedPost" sp\s+INNER JOIN "User" u/,
};

/**
 * Answers queries by pattern instead of running them, so the offline checks
 * can inspect the SQL, the parameter list, and the order of operations.
 */
function fakeDb(handlers = []) {
    const calls = [];

    return {
        calls,
        query: async (text, params = []) => {
            calls.push({ text, params });

            for (const handler of handlers) {
                if (handler.match.test(text)) {
                    return {
                        rows:
                            typeof handler.rows === "function"
                                ? handler.rows(text, params)
                                : handler.rows,
                    };
                }
            }

            return { rows: [] };
        },
    };
}

const REMIXER = "900000000000000003";
const AUTHOR = "900000000000000002";

function postRow(overrides = {}) {
    return {
        id: "post-1",
        itemType: "AESTHETIC",
        itemId: "source-aesthetic-1",
        authorDiscordId: AUTHOR,
        authorUsername: "author",
        authorDisplayName: "The Author",
        authorUserId: "author-user-id",
        ...overrides,
    };
}

function sourceAestheticRow(overrides = {}) {
    return {
        id: "source-aesthetic-1",
        name: "soft grunge",
        aestheticId: "grunge",
        moodId: null,
        colorFilter: null,
        profileSetId: null,
        usernameIdea: null,
        bio: null,
        status: null,
        symbols: ["\u2726"],
        palette: ["#111111", "#222222"],
        ...overrides,
    };
}

function sourcePaletteRow(overrides = {}) {
    return {
        id: "source-palette-1",
        name: "moss",
        aestheticId: null,
        moodId: null,
        colors: ["#101010", "#202020", "#303030"],
        ...overrides,
    };
}

/**
 * The default answers for a happy-path remix. `overrides` are matched first,
 * which is how a single test changes one query's answer.
 */
function happyDb(overrides = []) {
    return fakeDb([
        ...overrides,
        {
            match: SQL.insertAesthetic,
            rows: [{ id: "copy-1", name: "soft grunge" }],
        },
        {
            match: SQL.insertPalette,
            rows: [{ id: "copy-1", name: "moss" }],
        },
        {
            match: SQL.attribution,
            rows: [],
        },
        {
            match: SQL.sourceAesthetic,
            rows: [sourceAestheticRow()],
        },
        {
            match: SQL.sourcePalette,
            rows: [sourcePaletteRow()],
        },
        { match: SQL.premiumSet, rows: [] },
        { match: SQL.actorName, rows: [{ name: "remixer" }] },
        {
            /*
             * Param-aware so a lookup for an unknown post id behaves like the
             * empty result the database would give.
             */
            match: SQL.loadPost,
            rows: (text, params) =>
                params[0] === "post-1"
                    ? [postRow()]
                    : [],
        },
    ]);
}

function spy(rethrow = false) {
    const calls = [];

    const fn = async (...args) => {
        calls.push(args);

        if (rethrow) {
            throw new Error("downstream is down");
        }
    };

    fn.calls = calls;

    return fn;
}

/**
 * Builds a copy of the remix module over a given adapter, with the reward and
 * notification layers replaced so the checks can count their calls.
 */
function loadRemix(db, extra = {}) {
    const awards = extra.awardForRemix ?? spy();
    const notices =
        extra.createNotificationForDiscordUser ?? spy();

    return {
        awards,
        notices,
        module: loadModule(REMIX_PATH, {
            "./database": db,
            "./crownEarning": { awardForRemix: awards },
            "./notifications": {
                createNotificationForDiscordUser: notices,
            },
            ...extra.stubs,
        }),
    };
}

async function throws(fn) {
    try {
        await fn();
        return null;
    } catch (error) {
        return error;
    }
}

function offline() {
    section("remixable item types");

    const db = happyDb();
    const happy = loadRemix(db);
    const remix = happy.module;

    check(
        "remixFromPost is exported",
        typeof remix.remixFromPost === "function"
    );

    check(
        "aesthetics and palettes are remixable",
        remix.REMIXABLE_ITEM_TYPES.includes("AESTHETIC") &&
            remix.REMIXABLE_ITEM_TYPES.includes("PALETTE")
    );

    check(
        "asset posts are not remixable",
        !remix.REMIXABLE_ITEM_TYPES.includes("ASSET"),
        "an asset post points at a catalog set, not the poster's work"
    );

    section("refusals happen before anything is written");

    return (async () => {
        const missing = await throws(() =>
            remix.remixFromPost(REMIXER, "gone", {
                premiumUnlocked: false,
            })
        );

        check(
            "a post that is not in the feed is refused",
            missing instanceof Error,
            String(missing)
        );

        /*
         * `happyDb` answers every load-post query with the same row, so
         * overriding that one handler is enough to make the caller the author.
         */
        const selfDb = happyDb([
            {
                match: SQL.loadPost,
                rows: [postRow({ authorDiscordId: REMIXER })],
            },
        ]);

        const self = loadRemix(selfDb);

        const selfError = await throws(() =>
            self.module.remixFromPost(REMIXER, "post-1", {
                premiumUnlocked: true,
            })
        );

        check(
            "remixing your own post is refused",
            selfError instanceof Error &&
                /already your work/i.test(selfError.message),
            selfError?.message
        );

        check(
            "and nothing was inserted",
            !selfDb.calls.some((call) =>
                SQL.insertAesthetic.test(call.text)
            )
        );

        check(
            "and nobody was paid for it",
            self.awards.calls.length === 0
        );

        const assetDb = happyDb([
            {
                match: SQL.loadPost,
                rows: [
                    postRow({
                        itemType: "ASSET",
                        itemId: "catalog-set-1",
                    }),
                ],
            },
        ]);

        const asset = loadRemix(assetDb);

        const assetError = await throws(() =>
            asset.module.remixFromPost(REMIXER, "post-1", {
                premiumUnlocked: true,
            })
        );

        check(
            "an asset post is refused",
            assetError instanceof Error &&
                /aesthetics and palettes/i.test(
                    assetError.message
                ),
            assetError?.message
        );

        check(
            "and the refusal happens before the premium lookup",
            !assetDb.calls.some((call) =>
                SQL.premiumSet.test(call.text)
            )
        );

        /*
         * The first successful remix happens here so that the insert it
         * performed is available for the provenance checks below.
         */
        const result = await remix.remixFromPost(
            REMIXER,
            "post-1",
            { premiumUnlocked: false }
        );

        section("the copy carries provenance");

        const insertCalls = db.calls.filter((call) =>
            SQL.insertAesthetic.test(call.text)
        );

        check(
            "the happy path inserted exactly one row",
            insertCalls.length === 1,
            String(insertCalls.length)
        );

        const insert = insertCalls[0] ?? {
            text: "",
            params: [],
        };

        check(
            "the copy records the source post",
            insert.text.includes('"remixedFromPostId"')
        );

        check(
            "the copy records the source author",
            insert.text.includes('"remixedFromUserId"')
        );

        check(
            "the source post id is bound, not concatenated",
            insert.params.includes("post-1") &&
                !insert.text.includes("post-1")
        );

        check(
            "the author's internal id is bound",
            insert.params.includes("author-user-id")
        );

        check(
            "the copy is owned by the remixer, resolved from their id",
            insert.params[0] === REMIXER &&
                /FROM "User" u\s+WHERE\s+u\."discordId" = \$1/.test(
                    insert.text
                ),
            "the copy must belong to the remixer, not be inserted by id"
        );

        check(
            "both timestamps are written by the insert",
            /"createdAt",\s*"updatedAt"/.test(insert.text) &&
                /NOW\(\),\s*NOW\(\)/.test(insert.text),
            "an INSERT omitting updatedAt leaves it null and every sort breaks"
        );

        check(
            "the copy does not inherit the source's generation id",
            /SELECT\s+gen_random_uuid\(\)::text,\s+u\.id,\s+NULL,/.test(
                insert.text
            ),
            "generationId is UNIQUE; copying it would collide"
        );

        section("the result tells the UI who to credit");

        check(
            "the new item is reported back",
            result.itemId === "copy-1" &&
                result.itemType === "AESTHETIC",
            JSON.stringify(result)
        );

        check(
            "the attribution names the original creator",
            result.attribution.sourceDiscordId === AUTHOR &&
                result.attribution.sourceUsername === "author",
            JSON.stringify(result.attribution)
        );

        check(
            "the attribution links to their profile",
            result.attribution.href ===
                `/dashboard/u/${AUTHOR}`,
            String(result.attribution.href)
        );

        check(
            "the author was paid, and paid for the right thing",
            happy.awards.calls.length === 1 &&
                happy.awards.calls[0][0] === AUTHOR &&
                happy.awards.calls[0][1] === REMIXER &&
                happy.awards.calls[0][2] === "post-1",
            JSON.stringify(happy.awards.calls)
        );

        check(
            "the author was notified once",
            happy.notices.calls.length === 1,
            String(happy.notices.calls.length)
        );

        const notice = happy.notices.calls[0]?.[1] ?? {};

        check(
            "the notice is a REMIX with a dedupe key",
            notice.type === "REMIX" &&
                notice.dedupeKey ===
                    `remix:post-1:${REMIXER}`,
            JSON.stringify(notice)
        );

        check(
            "the notice names the remixer, not the author",
            /remixer/.test(notice.title ?? "") &&
                !/author/i.test(notice.title ?? ""),
            notice.title
        );

        section("premium artwork");

        const premiumHandler = {
            match: SQL.premiumSet,
            rows: [{ profileSetId: "premium-set-1" }],
        };

        const premiumStubs = {
            stubs: {
                "./assetCatalog": {
                    isPremiumSet: (id) =>
                        id === "premium-set-1",
                },
            },
        };

        const lockedDb = happyDb([premiumHandler]);

        const locked = loadRemix(lockedDb, premiumStubs);

        const lockedError = await throws(() =>
            locked.module.remixFromPost(
                REMIXER,
                "post-1",
                { premiumUnlocked: false }
            )
        );

        check(
            "a premium set without the entitlement is refused",
            lockedError instanceof Error &&
                /premium/i.test(lockedError.message),
            lockedError?.message
        );

        check(
            "and no copy was written",
            !lockedDb.calls.some((call) =>
                SQL.insertAesthetic.test(call.text)
            )
        );

        const unlockedDb = happyDb([premiumHandler]);

        const unlocked = loadRemix(unlockedDb, premiumStubs);

        const unlockedResult =
            await unlocked.module.remixFromPost(
                REMIXER,
                "post-1",
                { premiumUnlocked: true }
            );

        check(
            "the same set copies once the entitlement is unlocked",
            unlockedResult.itemId === "copy-1"
        );

        section("palettes");

        const palettePost = {
            match: SQL.loadPost,
            rows: [
                postRow({
                    itemType: "PALETTE",
                    itemId: "source-palette-1",
                }),
            ],
        };

        const paletteDb = happyDb([palettePost]);

        const palette = loadRemix(paletteDb);

        const paletteResult =
            await palette.module.remixFromPost(
                REMIXER,
                "post-1",
                { premiumUnlocked: false }
            );

        check(
            "a palette post copies into a palette",
            paletteResult.itemType === "PALETTE",
            JSON.stringify(paletteResult)
        );

        const paletteInsert = paletteDb.calls.find((call) =>
            SQL.insertPalette.test(call.text)
        );

        check(
            "the palette copy carries provenance too",
            Boolean(paletteInsert) &&
                paletteInsert.text.includes(
                    '"remixedFromUserId"'
                ) &&
                paletteInsert.params.includes(
                    "author-user-id"
                )
        );

        const tinyDb = happyDb([
            palettePost,
            {
                match: SQL.sourcePalette,
                rows: [
                    sourcePaletteRow({
                        colors: ["#101010", "#202020"],
                    }),
                ],
            },
        ]);

        const tiny = loadRemix(tinyDb);

        const tinyError = await throws(() =>
            tiny.module.remixFromPost(REMIXER, "post-1", {
                premiumUnlocked: false,
            })
        );

        check(
            "a palette too small to re-save is refused",
            tinyError instanceof Error &&
                /too small/i.test(tinyError.message),
            tinyError?.message
        );

        check(
            "and it was not copied",
            !tinyDb.calls.some((call) =>
                SQL.insertPalette.test(call.text)
            )
        );

        section("attribution lookup");

        const attributionDb = fakeDb([
            { match: SQL.attribution, rows: [] },
        ]);

        const attribution = loadRemix(attributionDb);

        const assetOnly =
            await attribution.module.getAttributionsForPosts(
                [
                    {
                        id: "p1",
                        itemType: "ASSET",
                        itemId: "set-1",
                    },
                ]
            );

        check(
            "a page of asset posts needs no query",
            assetOnly.size === 0 &&
                attributionDb.calls.length === 0,
            String(attributionDb.calls.length)
        );

        await attribution.module.getAttributionsForPosts([
            { id: "p1", itemType: "AESTHETIC", itemId: "a1" },
            { id: "p2", itemType: "PALETTE", itemId: "pal1" },
        ]);

        const attrCall = attributionDb.calls[0] ?? {
            text: "",
            params: [],
        };

        check(
            "one query covers a mixed page",
            attributionDb.calls.length === 1,
            String(attributionDb.calls.length)
        );

        check(
            "item ids are passed as array parameters",
            Array.isArray(attrCall.params[0]) &&
                attrCall.params[0].includes("a1") &&
                Array.isArray(attrCall.params[1]) &&
                attrCall.params[1].includes("pal1"),
            JSON.stringify(attrCall.params)
        );

        /*
         * The whole reason `remixedFromUserId` exists. Joining through
         * SharedPost would silently drop the credit the moment the original
         * creator unshared their post.
         */
        check(
            "the credit is resolved through the author id",
            /INNER JOIN "User" su\s+ON su\.id = sa\."remixedFromUserId"/.test(
                attrCall.text
            ) &&
                /INNER JOIN "User" su\s+ON su\.id = spal\."remixedFromUserId"/.test(
                    attrCall.text
            ),
            "keying the join on the post would erase credit when a post is unshared"
        );

        check(
            "the source post is not required to exist",
            !/JOIN "SharedPost" src/.test(attrCall.text),
            "the source post must be optional; the author is not"
        );

        check(
            "the query is qualified (no bare createdAt)",
            !/[^.\w"]"createdAt"/.test(attrCall.text)
        );

        section("rewards happen after the copy exists");

        const grumpyDb = happyDb();

        const grumpy = loadRemix(grumpyDb, {
            awardForRemix: spy(true),
            createNotificationForDiscordUser: spy(true),
        });

        /*
         * The real `awardForRemix` and `createNotificationForDiscordUser`
         * swallow their own errors, so a broken ledger must not cost the
         * remixer an item they already own. These stubs throw to pin down that
         * the copy is written *first* — the lib deliberately does not wrap the
         * calls, because relying on the helpers' contract is what keeps the
         * remix and the award from being wrapped in one try/catch.
         */
        const survived = await throws(() =>
            grumpy.module.remixFromPost(
                REMIXER,
                "post-1",
                { premiumUnlocked: false }
            )
        );

        check(
            "the copy was written before the reward was attempted",
            grumpyDb.calls.findIndex((call) =>
                SQL.insertAesthetic.test(call.text)
            ) !== -1
        );

        check(
            "a throwing reward surfaces rather than being silently hidden",
            survived instanceof Error,
            "the real helpers never throw; if they start to, this test should fail loudly"
        );

        section("premiumSetForPost");

        const premiumLookupDb = fakeDb([
            {
                match: SQL.premiumSet,
                rows: [{ profileSetId: "free-set" }],
            },
        ]);

        const premiumLookup = loadRemix(premiumLookupDb, {
            stubs: {
                "./assetCatalog": {
                    isPremiumSet: () => false,
                },
            },
        });

        check(
            "a set the catalog does not list as premium is not premium",
            (await premiumLookup.module.premiumSetForPost(
                "post-1"
            )) === null
        );

        check(
            "the lookup is scoped to aesthetic posts",
            /sp\."itemType" = 'AESTHETIC'/.test(
                premiumLookupDb.calls[0]?.text ?? ""
            ),
            "palettes carry no artwork, so gating them would be meaningless"
        );
    })();
}

async function withDatabase() {
    section("against the database");

    let Client;
    let connectionString;

    try {
        require(path.join(ROOT, "node_modules", "dotenv"))
            .config({ path: path.join(ROOT, ".env") });

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

        /*
         * The real helper checks a connection out of a pool. This suite owns
         * exactly one connection and nothing else touches it, so running the
         * work inline against that connection is the same transaction — and
         * crownEarning's `FOR UPDATE` locks still behave correctly.
         */
        withTransaction: async (work) => {
            await client.query("BEGIN");

            try {
                const result = await work(client);
                await client.query("COMMIT");
                return result;
            } catch (error) {
                await client.query("ROLLBACK").catch(() => {});
                throw error;
            }
        },
    };

    /*
     * Nothing is stubbed here. The real reward code runs against the real
     * ledger and the real notification table, which is the only way to prove
     * the idempotency keys hold and that the dedupe unique index is doing its
     * job.
     */
    const remix = loadModule(REMIX_PATH, {
        "./database": adapter,
    });

    const creator = loadModule(CREATOR_PATH, {
        "./database": adapter,
    });

    const sharedFeed = loadModule(SHARED_FEED_PATH, {
        "./database": adapter,
    });

    const AUTHOR_ID = "900000000000000921";
    const REMIXER_A = "900000000000000922";
    const REMIXER_B = "900000000000000923";

    const USERS = {
        author: "remix-test-author",
        remixerA: "remix-test-remixer-a",
        remixerB: "remix-test-remixer-b",
    };

    const IDS = Object.values(USERS);

    async function cleanup() {
        /*
         * Deleting the users is enough: every table involved cascades on
         * userId. The two provenance columns are SET NULL rather than CASCADE,
         * which is precisely why deleting a creator must not delete the copies
         * other people made from their work.
         */
        await client.query(
            `DELETE FROM "User" WHERE id = ANY($1::text[])`,
            [IDS]
        );
    }

    async function awardsFor(discordId) {
        const result = await client.query(
            `
            SELECT COUNT(*)::int AS count
            FROM "CrownTransaction" ct
            INNER JOIN "User" u ON u.id = ct."userId"
            WHERE
                u."discordId" = $1
                AND ct.source = 'remix_received'
            `,
            [discordId]
        );

        return result.rows[0].count;
    }

    async function publish(userId, postId, itemType, itemId, caption) {
        return client.query(
            `
            INSERT INTO "SharedPost" (
                id, "userId", "itemType", "itemId", caption, tags,
                "likeCount", "commentCount", "createdAt", "updatedAt"
            )
            VALUES ($1, $2, $3, $4, $5, ARRAY['test'], 0, 0, NOW(), NOW())
            `,
            [postId, userId, itemType, itemId, caption]
        );
    }

    try {
        await cleanup();

        for (const [id, discordId, username] of [
            [USERS.author, AUTHOR_ID, "remixauthor"],
            [USERS.remixerA, REMIXER_A, "remixremixera"],
            [USERS.remixerB, REMIXER_B, "remixremixerb"],
        ]) {
            await client.query(
                `
                INSERT INTO "User" (
                    id, "discordId", username, "displayName",
                    "createdAt", "updatedAt"
                )
                VALUES ($1, $2, $3, $3, NOW(), NOW())
                `,
                [id, discordId, username]
            );
        }

        await client.query(
            `
            INSERT INTO "SavedAesthetic" (
                id, "userId", name, "aestheticId", symbols, palette,
                "createdAt", "updatedAt"
            )
            VALUES
                (
                    'remix-test-source-aesthetic', $1,
                    'soft grunge', 'grunge',
                    ARRAY['\u2726'], ARRAY['#111111', '#222222'],
                    NOW(), NOW()
                )
            `,
            [USERS.author]
        );

        await client.query(
            `
            INSERT INTO "SavedPalette" (
                id, "userId", name, colors,
                "createdAt", "updatedAt"
            )
            VALUES
                (
                    'remix-test-source-palette', $1, 'moss',
                    ARRAY['#101010', '#202020', '#303030'],
                    NOW(), NOW()
                )
            `,
            [USERS.author]
        );

        await publish(
            USERS.author,
            "remix-test-post-aesthetic",
            "AESTHETIC",
            "remix-test-source-aesthetic",
            "my grunge set"
        );

        await publish(
            USERS.author,
            "remix-test-post-palette",
            "PALETTE",
            "remix-test-source-palette",
            "moss"
        );

        const published = await client.query(
            `
            SELECT COUNT(*)::int AS count
            FROM "SharedPost"
            WHERE "userId" = $1
            `,
            [USERS.author]
        );

        check(
            "seeded an author with two published posts",
            published.rows[0].count === 2
        );

        const first = await remix.remixFromPost(
            REMIXER_A,
            "remix-test-post-aesthetic",
            { premiumUnlocked: false }
        );

        const copy = await client.query(
            `
            SELECT
                id, "userId", name, "aestheticId",
                "remixedFromPostId", "remixedFromUserId",
                "generationId", symbols, palette,
                "createdAt", "updatedAt"
            FROM "SavedAesthetic"
            WHERE id = $1
            `,
            [first.itemId]
        );

        check("the copy exists", copy.rows.length === 1);

        check(
            "the copy belongs to the remixer",
            copy.rows[0]?.userId === USERS.remixerA
        );

        check(
            "the copy carries the source post",
            copy.rows[0]?.remixedFromPostId ===
                "remix-test-post-aesthetic",
            String(copy.rows[0]?.remixedFromPostId)
        );

        check(
            "the copy carries the source author",
            copy.rows[0]?.remixedFromUserId === USERS.author,
            String(copy.rows[0]?.remixedFromUserId)
        );

        check(
            "the copy kept the artwork, not just the credit",
            copy.rows[0]?.aestheticId === "grunge" &&
                copy.rows[0]?.name === "soft grunge" &&
                copy.rows[0]?.palette?.length === 2,
            JSON.stringify(copy.rows[0])
        );

        check(
            "the copy did not inherit the generation id",
            copy.rows[0]?.generationId === null,
            "generationId is UNIQUE; a duplicate would have thrown"
        );

        check(
            "the copy has both timestamps",
            copy.rows[0]?.createdAt !== null &&
                copy.rows[0]?.updatedAt !== null
        );

        check(
            "the copy is not itself published",
            (
                await client.query(
                    `SELECT 1 FROM "SharedPost" WHERE "itemId" = $1`,
                    [first.itemId]
                )
            ).rows.length === 0,
            "a remix button must not write to the feed on its own"
        );

        section("the credit survives the source being unshared");

        const unshared = await sharedFeed.unshareItemById(
            "remix-test-post-aesthetic",
            AUTHOR_ID
        );

        check(
            "the author unshared the original post",
            unshared === true
        );

        await publish(
            USERS.remixerA,
            "remix-test-post-copy",
            "AESTHETIC",
            first.itemId,
            "my remix"
        );

        const attributions =
            await remix.getAttributionsForPosts([
                {
                    id: "remix-test-post-copy",
                    itemType: "AESTHETIC",
                    itemId: first.itemId,
                },
            ]);

        const attribution = attributions.get(
            "remix-test-post-copy"
        );

        check(
            "the remix card still credits the original creator",
            attribution?.sourceDiscordId === AUTHOR_ID,
            JSON.stringify(attribution)
        );

        check(
            "but the dead link to the old post is gone",
            attribution?.sourcePostId === null,
            `got ${String(attribution?.sourcePostId)}; the FK is SET NULL, so the credit must not depend on it`
        );

        const originals =
            await remix.getAttributionsForPosts([
                {
                    id: "remix-test-post-palette",
                    itemType: "PALETTE",
                    itemId: "remix-test-source-palette",
                },
            ]);

        check(
            "an original work gets no attribution",
            originals.size === 0,
            JSON.stringify([...originals.keys()])
        );

        section("the palette path");

        const paletteResult = await remix.remixFromPost(
            REMIXER_A,
            "remix-test-post-palette",
            { premiumUnlocked: false }
        );

        const paletteCopy = await client.query(
            `
            SELECT "remixedFromUserId", colors
            FROM "SavedPalette"
            WHERE id = $1
            `,
            [paletteResult.itemId]
        );

        check(
            "a palette copies with its colors and its credit",
            paletteCopy.rows[0]?.remixedFromUserId ===
                USERS.author &&
                paletteCopy.rows[0]?.colors?.length === 3,
            JSON.stringify(paletteCopy.rows[0])
        );

        section("the reward cannot be farmed");

        check(
            "the author was paid once per remix",
            (await awardsFor(AUTHOR_ID)) === 2,
            "one for the aesthetic, one for the palette"
        );

        const again = await remix.remixFromPost(
            REMIXER_A,
            "remix-test-post-palette",
            { premiumUnlocked: false }
        );

        check(
            "remixing the same post again makes a new copy",
            again.itemId !== paletteResult.itemId,
            `${again.itemId} vs ${paletteResult.itemId}`
        );

        check(
            "but pays the author nothing extra",
            (await awardsFor(AUTHOR_ID)) === 2,
            "the key is (post, remixer), not the new item id"
        );

        await remix.remixFromPost(
            REMIXER_B,
            "remix-test-post-palette",
            { premiumUnlocked: false }
        );

        check(
            "a different remixer does pay again",
            (await awardsFor(AUTHOR_ID)) === 3,
            "credit is per person, not one lump per post"
        );

        const selfError = await throws(() =>
            remix.remixFromPost(
                AUTHOR_ID,
                "remix-test-post-palette",
                { premiumUnlocked: false }
            )
        );

        check(
            "the author remixing their own post is refused",
            selfError instanceof Error &&
                /already your work/i.test(selfError.message),
            selfError?.message
        );

        check(
            "and paid nothing for it",
            (await awardsFor(AUTHOR_ID)) === 3
        );

        check(
            "the remixer was never paid for their own remix",
            (await awardsFor(REMIXER_A)) === 0
        );

        section("the notification and the profile stat");

        const notifications = await client.query(
            `
            SELECT n.type, n.title, n."dedupeKey", n.icon
            FROM "Notification" n
            INNER JOIN "User" u ON u.id = n."userId"
            WHERE
                u."discordId" = $1
                AND n."dedupeKey" = $2
            `,
            [
                AUTHOR_ID,
                `remix:remix-test-post-palette:${REMIXER_A}`,
            ]
        );

        check(
            "the author got exactly one REMIX notice for that remix",
            notifications.rows.length === 1 &&
                notifications.rows[0].type === "REMIX",
            JSON.stringify(notifications.rows)
        );

        check(
            "the notice names the remixer",
            /remixremixera/.test(
                notifications.rows[0]?.title ?? ""
            ),
            notifications.rows[0]?.title
        );

        check(
            "the notice carries the icon the bell expects",
            notifications.rows[0]?.icon === "Sparkles"
        );

        const profile =
            await creator.getCreatorProfile(AUTHOR_ID);

        /*
         * Four copies exist by now: remixer A's aesthetic, palette, and repeat
         * palette, plus remixer B's palette. The refused self-remix must not
         * have added a fifth.
         */
        check(
            "the profile counts remixes received",
            profile?.remixesReceived === 4,
            String(profile?.remixesReceived)
        );

        const otherProfile =
            await creator.getCreatorProfile(REMIXER_A);

        check(
            "a remixer is not credited with remixes received",
            otherProfile?.remixesReceived === 0,
            String(otherProfile?.remixesReceived)
        );
    } catch (error) {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m database section threw — ${error.stack}`
        );
    } finally {
        try {
            await cleanup();
        } catch {
            /* nothing useful to do */
        }

        await client.end();
    }
}

(async () => {
    console.log(
        "\n\x1b[1mRemixing with attribution verification\x1b[0m"
    );

    await offline();
    await withDatabase();

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed > 0 ? 1 : 0);
})();
