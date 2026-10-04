#!/usr/bin/env node
/**
 * Verification for the Phase 7 creator surface:
 * `studio/lib/creator.ts`, `studio/lib/creatorHref.ts` and
 * `studio/lib/feedSearch.ts`.
 *
 * Creator profiles and public Discover search are the first places the
 * Studio takes a string straight from a URL and uses it to select other
 * people's content. Both the ID and the search term are therefore attacker-
 * controlled, and the SQL is hand-written with no test runner in the
 * Studio. This transpiles the real modules with the Studio's own esbuild so
 * the shipped code is what gets asserted, not a copy of it.
 *
 * Asserted behavior:
 *
 *   1. A non-snowflake ID never reaches SQL, in either the href helper or
 *      the profile lookup.
 *   2. The search term is always a bound parameter, never interpolated.
 *   3. ILIKE wildcards typed by the user are escaped.
 *   4. Each match branch is guarded by its own item type, so a term cannot
 *      match every aesthetic/post just because the LEFT JOIN produced a row.
 *   5. Catalog set ids are passed as an array parameter.
 *   6. Sort and filters produce the expected ORDER BY / extra parameters.
 *   7. Terms that are too short or too long are normalised, not searched.
 *
 * The database section is skipped, not failed, when no database is
 * reachable, so this still runs in CI without one.
 *
 * Usage: node scripts/testCreatorProfiles.js
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

const HREF_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "creatorHref.ts"
);

const CREATOR_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "creator.ts"
);

const SEARCH_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "feedSearch.ts"
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
 * sibling `.ts` files (or `.json`) and load the same way.
 */
function loadModule(modulePath, stubRequire = {}) {
    /*
     * `sharedFeed` pulls in `apiError`, which imports `next/server`. That
     * module only exists inside the Next build, so it is stubbed here — the
     * checks below never touch the error helpers.
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
            `testCreatorProfiles: cannot resolve "${specifier}" ` +
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
 * Records every statement it is handed instead of running it, so the
 * offline checks can inspect the SQL and the parameter list.
 */
function recordingAdapter(rows = []) {
    const calls = [];

    return {
        calls,
        query: async (text, params = []) => {
            calls.push({ text, params });
            return { rows };
        },
    };
}

function offline() {
    section("creatorHref — Discord ID validation");

    const href = loadModule(HREF_PATH);

    check(
        "a snowflake becomes a profile href",
        href.creatorProfileHref("123456789012345678") ===
            "/dashboard/u/123456789012345678",
        String(href.creatorProfileHref("123456789012345678"))
    );

    check(
        "surrounding whitespace is trimmed",
        href.normalizeDiscordId("  424242424  ") === "424242424"
    );

    for (const bad of [
        "",
        "   ",
        null,
        undefined,
        "1234",
        "abc123456",
        "123456789012345678; DROP TABLE \"User\"; --",
        "../../etc/passwd",
        "123456789012345678/../a",
    ]) {
        check(
            `rejects ${JSON.stringify(bad)}`,
            href.normalizeDiscordId(bad) === null
        );
    }

    check(
        "no href for a bad id rather than a dead link",
        href.creatorProfileHref("not-an-id") === null
    );

    section("creator — profile lookup");

    const db = recordingAdapter();

    const creator = loadModule(CREATOR_PATH, {
        "./database": db,
    });

    check(
        "getCreatorProfile is exported",
        typeof creator.getCreatorProfile === "function"
    );

    return (async () => {
        const before = db.calls.length;
        const rejected =
            await creator.getCreatorProfile("nope");

        check(
            "a bad id short-circuits before any query",
            rejected === null &&
                db.calls.length === before
        );

        await creator.getCreatorProfile("123456789012345678");

        const profileCall =
            db.calls[db.calls.length - 1];

        check(
            "the id is bound, not concatenated",
            profileCall.params.includes(
                "123456789012345678"
            ) &&
                !profileCall.text.includes(
                    "123456789012345678"
                )
        );

        check(
            "the profile query is qualified (no bare createdAt)",
            !/[^.\w"]"createdAt"/.test(
                profileCall.text
            ),
            "an unqualified column in a joined query is a runtime 500"
        );

        await creator.getCreatorTopTags(
            "123456789012345678"
        );

        const tagCall =
            db.calls[db.calls.length - 1];

        check(
            "top tags group by the unnested tag",
            /unnest\(sp\.tags\)/.test(tagCall.text) &&
                /GROUP BY tagged\.tag/.test(tagCall.text)
        );

        check(
            "top tags clamp the limit parameter",
            tagCall.params[1] === 10
        );

        await creator.getCreatorTopTags(
            "123456789012345678",
            9999
        );

        check(
            "an oversized tag limit is clamped",
            db.calls[db.calls.length - 1].params[1] === 30
        );

        section("feedSearch — term handling");

        const search = loadModule(SEARCH_PATH, {
            "./database": recordingAdapter(),
        });

        check(
            "terms shorter than two characters are dropped",
            search.normalizeFeedSearchTerm("a") === null &&
                search.normalizeFeedSearchTerm("  ") === null &&
                search.normalizeFeedSearchTerm(null) === null
        );

        check(
            "an over-long term is truncated, not rejected",
            search.normalizeFeedSearchTerm("x".repeat(200))
                .length === 64
        );

        check(
            "typed wildcards are escaped",
            search.escapeLike("100%_a\\b") ===
                "100\\%\\_a\\\\b",
            search.escapeLike("100%_a\\b")
        );

        check(
            "the pattern wraps the escaped term",
            search.feedSearchPattern("50% off") ===
                "%50\\% off%"
        );

        section("feedSearch — query shape");

        const built = search.buildFeedSearchQuery(
            "cozy",
            "111111111111111111",
            {}
        );

        check(
            "the term is only ever a parameter",
            built.params.includes("%cozy%") &&
                !built.text.includes("cozy")
        );

        check(
            "$1 is the viewer id",
            built.params[0] === "111111111111111111"
        );

        check(
            "catalog matches are passed as an array",
            Array.isArray(built.params[2])
        );

        check(
            "the viewer subquery survived from FEED_SELECT",
            /"SharedPostLike"/.test(built.text)
        );

        /*
         * The regression this exists for: the joins are LEFT JOINs, so a
         * bare `sa.id IS NOT NULL` in the WHERE would make every aesthetic
         * post match every term. Each branch must carry its own type guard.
         */
        check(
            "the aesthetic branch is type-guarded",
            /sp\."itemType" = 'AESTHETIC'[\s\S]{0,120}sa\.id IS NOT NULL/.test(
                search.FEED_SEARCH_MATCH_SQL
            )
        );

        check(
            "the palette branch is type-guarded",
            /sp\."itemType" = 'PALETTE'[\s\S]{0,120}spal\.id IS NOT NULL/.test(
                search.FEED_SEARCH_MATCH_SQL
            )
        );

        check(
            "no unguarded joined-row check in the match",
            !/^\s*sa\.id IS NOT NULL\s*$/m.test(
                search.FEED_SEARCH_MATCH_SQL
            ) &&
                !/^\s*spal\.id IS NOT NULL\s*$/m.test(
                    search.FEED_SEARCH_MATCH_SQL
                )
        );

        check(
            "the match fragment is inlined into the statement",
            built.text.includes(
                search.FEED_SEARCH_MATCH_SQL
            )
        );

        const sorted = search.buildFeedSearchQuery(
            "cozy",
            null,
            {
                itemType: "PALETTE",
                tag: "#Cozy",
                sort: "popular",
                limit: 500,
                offset: -5,
            }
        );

        check(
            "popular sorts by likes then recency",
            /ORDER BY sp\."likeCount" DESC, sp\."createdAt" DESC/.test(
                sorted.text
            )
        );

        check(
            "recent sorts by recency",
            /ORDER BY sp\."createdAt" DESC/.test(
                built.text
            )
        );

        check(
            "the type filter is bound with an enum cast",
            sorted.params.includes("PALETTE") &&
                /sp\."itemType" = \$4::"SharedItemType"/.test(
                    sorted.text
                )
        );

        check(
            "the tag is normalised and bound",
            sorted.params.includes("cozy") &&
                /AND \$5 = ANY\(sp\.tags\)/.test(
                    sorted.text
                )
        );

        check(
            "limit and offset are clamped",
            sorted.params.includes(60) &&
                sorted.params.includes(0)
        );

        check(
            "every placeholder is accounted for",
            (() => {
                const highest = Math.max(
                    ...[
                        ...built.text.matchAll(/\$(\d+)/g),
                        ...sorted.text.matchAll(/\$(\d+)/g),
                    ].map((m) => Number(m[1]))
                );

                return (
                    highest === sorted.params.length
                );
            })(),
            "a placeholder with no parameter is a runtime error"
        );

        section("feedSearch — short-circuits");

        const quiet = recordingAdapter();

        const live = loadModule(SEARCH_PATH, {
            "./database": quiet,
        });

        const emptyPosts =
            await live.searchFeedPosts(
                "a",
                "111111111111111111"
            );

        const emptyCreators =
            await live.searchFeedCreators("");

        check(
            "a too-short term runs no query",
            Array.isArray(emptyPosts) &&
                emptyPosts.length === 0 &&
                emptyCreators.length === 0 &&
                quiet.calls.length === 0
        );

        await live.searchFeedPosts(
            "cozy",
            "111111111111111111"
        );

        check(
            "a real term does run",
            quiet.calls.length === 1
        );

        await live.searchFeedCreators("cozy");

        const creatorCall =
            quiet.calls[quiet.calls.length - 1];

        check(
            "creator search only surfaces accounts that published",
            /INNER JOIN "SharedPost"/.test(
                creatorCall.text
            )
        );

        check(
            "creator search groups rather than repeats",
            /GROUP BY/.test(creatorCall.text)
        );

        return true;
    })();
}

async function withDatabase() {
    section("against the database");

    let Client;
    let connectionString;

    try {
        require(path.join(
            ROOT,
            "node_modules",
            "dotenv"
        )).config({
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

    const creator = loadModule(CREATOR_PATH, {
        "./database": adapter,
    });

    const search = loadModule(SEARCH_PATH, {
        "./database": adapter,
    });

    const DISCORD_ID = "900000000000000907";
    const USER_ID = "creator-profiles-test-user";

    async function cleanup() {
        await client.query(
            `
            DELETE FROM "SharedPostComment"
            WHERE "postId" IN (
                SELECT id FROM "SharedPost" WHERE "userId" = $1
            )
            `,
            [USER_ID]
        );

        await client.query(
            `
            DELETE FROM "SharedPostLike"
            WHERE "postId" IN (
                SELECT id FROM "SharedPost" WHERE "userId" = $1
            )
            `,
            [USER_ID]
        );

        await client.query(
            `DELETE FROM "SharedPost" WHERE "userId" = $1`,
            [USER_ID]
        );

        await client.query(
            `DELETE FROM "User" WHERE id = $1`,
            [USER_ID]
        );
    }

    try {
        await cleanup();

        await client.query(
            `
            INSERT INTO "User" (
                id, "discordId", username, "displayName",
                "createdAt", "updatedAt"
            )
            VALUES (
                $1, $2, 'cptest', 'Creator Test',
                NOW(), NOW()
            )
            `,
            [USER_ID, DISCORD_ID]
        );

        const shared = await client.query(
            `
            INSERT INTO "SharedPost" (
                id, "userId", "itemType", "itemId", caption, tags,
                "likeCount", "commentCount", "createdAt", "updatedAt"
            )
            VALUES
                (
                    'creator-profiles-test-post-1', $1, 'PALETTE',
                    'item-1', 'warm autumn',
                    ARRAY['cozy', 'autumn'], 4, 2,
                    NOW(), NOW()
                ),
                (
                    'creator-profiles-test-post-2', $1, 'PALETTE',
                    'item-2', 'cold',
                    ARRAY['cozy'], 1, 0,
                    NOW(), NOW()
                )
            RETURNING id
            `,
            [USER_ID]
        );

        check(
            "seeded two posts",
            shared.rows.length === 2
        );

        const profile =
            await creator.getCreatorProfile(DISCORD_ID);

        check(
            "the profile resolves",
            profile !== null &&
                profile.discordId === DISCORD_ID
        );

        check(
            "post count is right",
            profile?.postCount === 2,
            String(profile?.postCount)
        );

        check(
            "likes received are summed",
            profile?.likesReceived === 5,
            String(profile?.likesReceived)
        );

        check(
            "comments received are summed",
            profile?.commentsReceived === 2,
            String(profile?.commentsReceived)
        );

        check(
            "the type breakdown is right",
            profile?.paletteCount === 2 &&
                profile?.profileCount === 0 &&
                profile?.assetSetCount === 0
        );

        const tags = await creator.getCreatorTopTags(
            DISCORD_ID
        );

        check(
            "tags are aggregated across posts",
            tags.some(
                (entry) =>
                    entry.tag === "cozy" &&
                    entry.count === 2
            ),
            JSON.stringify(tags)
        );

        const hits = await search.searchFeedCreators(
            "Creator Test"
        );

        check(
            "a creator is found by display name",
            hits.some(
                (hit) =>
                    hit.discordId === DISCORD_ID &&
                    hit.postCount === 2
            ),
            JSON.stringify(hits)
        );

        const byTag = await search.searchFeedCreators(
            "autumn"
        );

        check(
            "a creator is found by a tag on their work",
            byTag.some(
                (hit) => hit.discordId === DISCORD_ID
            )
        );

        const found = await search.searchFeedPosts(
            "autumn",
            null,
            {}
        );

        check(
            "a caption match comes back",
            found.some(
                (post) =>
                    post.id ===
                    "creator-profiles-test-post-1"
            ),
            JSON.stringify(
                found.map((post) => post.id)
            )
        );

        const missed = await search.searchFeedPosts(
            "zzzznotathing",
            null,
            {}
        );

        check(
            "a term matching nothing returns nothing",
            missed.length === 0,
            JSON.stringify(
                missed.map((post) => post.id)
            )
        );

        /*
         * The whole point of the per-branch guards: an unrelated term must
         * not drag in these palette posts via the LEFT JOIN.
         */
        const leaked = await search.searchFeedPosts(
            "creator-profiles-test",
            null,
            {
                itemType: "PALETTE",
            }
        );

        check(
            "a term that only matches internal ids leaks nothing",
            leaked.length === 0,
            JSON.stringify(
                leaked.map((post) => post.id)
            )
        );

        const escaped = await search.searchFeedPosts(
            "warm autumn%",
            null,
            {}
        );

        check(
            "a trailing wildcard in the term is literal",
            escaped.length === 0,
            "ILIKE wildcards typed by the user must not broaden the search"
        );

        const tagged = await search.searchFeedPosts(
            "warm",
            null,
            {
                tag: "cozy",
            }
        );

        check(
            "search and tag filter combine",
            tagged.length === 1
        );
    } catch (error) {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m database section threw — ${error.message}`
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
        "\n\x1b[1mCreator profiles & public search verification\x1b[0m"
    );

    await offline();
    await withDatabase();

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed > 0 ? 1 : 0);
})();
