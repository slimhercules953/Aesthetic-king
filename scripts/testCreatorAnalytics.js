#!/usr/bin/env node
/**
 * Verification for the Phase 7 creator analytics data layer:
 * `studio/lib/creatorAnalytics.ts`.
 *
 * This module is the only place the Studio writes on behalf of somebody
 * else's page view, and the only place that turns a pile of feed
 * interactions into a number a creator might pay for. Both halves deserve
 * real checks: the write path has to refuse to invent an audience, and the
 * read path has to keep its window clamped so `?days=99999` cannot ask
 * Postgres for a hundred-year `generate_series`.
 *
 * The module is transpiled with the Studio's own esbuild, so the shipped
 * code is what gets asserted rather than a copy of it.
 *
 * Asserted behavior:
 *
 *   1. A view is a person: the upsert targets the (userId, postId) key and
 *      repeats bump a counter instead of inserting a second row.
 *   2. The author is excluded inside the statement, not by a second query.
 *   3. Nothing is interpolated — post id and viewer id are both bound.
 *   4. A malformed viewer id or empty post id never reaches SQL.
 *   5. A write that returns no row is classified as "self" or "not-found",
 *      and a database failure is not turned into a false "recorded".
 *   6. The window is clamped to 1..90 everywhere it is bound.
 *   7. Lifetime totals are not filtered by the window; per-post window
 *      views and the trend are.
 *   8. Every placeholder in every statement is supplied.
 *   9. Against a real database: dedupe, self-refusal, reach vs impressions,
 *      and the trend bucket count.
 *
 * The database section is skipped, not failed, when no database is
 * reachable, so this still runs in CI without one.
 *
 * Usage: node scripts/testCreatorAnalytics.js
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

const ANALYTICS_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "creatorAnalytics.ts"
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
 * maps a specifier to a fake export; relative specifiers resolve to
 * sibling `.ts` files and load the same way.
 */
function loadModule(modulePath, stubRequire = {}) {
    const stubs = { ...stubRequire };

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
            `testCreatorAnalytics: cannot resolve "${specifier}" ` +
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

/**
 * Records every statement instead of running it. `rowsFor` decides what a
 * call returns, so a test can script "the upsert matched nothing" and then
 * "the post lookup said it was yours".
 */
function recordingAdapter(rowsFor = () => []) {
    const calls = [];

    return {
        calls,
        query: async (text, params = []) => {
            calls.push({ text, params });
            return { rows: rowsFor(text, params, calls.length - 1) };
        },
    };
}

/** Highest `$n` placeholder in a statement. */
function highestPlaceholder(text) {
    let max = 0;

    for (const match of text.matchAll(/\$(\d+)/g)) {
        max = Math.max(max, Number(match[1]));
    }

    return max;
}

async function offline() {
    section("exports");

    const shapes = loadModule(ANALYTICS_PATH, {
        "./database": recordingAdapter(),
    });

    check(
        "recordPostView is exported",
        typeof shapes.recordPostView === "function"
    );

    check(
        "getCreatorAnalytics is exported",
        typeof shapes.getCreatorAnalytics === "function"
    );

    section("recordPostView — short-circuits");

    const idle = recordingAdapter();
    const idleLib = loadModule(ANALYTICS_PATH, {
        "./database": idle,
    });

    for (const bad of ["", null, undefined, "   "]) {
        const outcome =
            await idleLib.recordPostView("post-1", bad);

        check(
            `a ${JSON.stringify(bad)} viewer id is refused with no query`,
            outcome === "not-found" && idle.calls.length === 0
        );
    }

    await idleLib.recordPostView("", "123456789012345678");

    check(
        "an empty post id is refused with no query",
        idle.calls.length === 0
    );

    section("recordPostView — the write itself");

    const db = recordingAdapter((text) =>
        text.includes("INSERT INTO") ? [{ id: "post-abc" }] : []
    );
    const lib = loadModule(ANALYTICS_PATH, {
        "./database": db,
    });

    const outcome = await lib.recordPostView(
        "post-abc",
        "123456789012345678"
    );

    check(
        "a first write reports recorded",
        outcome === "recorded",
        String(outcome)
    );

    const write = db.calls[0];

    check(
        "exactly one statement runs on the happy path",
        db.calls.length === 1,
        `${db.calls.length} statements`
    );

    check(
        "it is an upsert on the (userId, postId) key",
        /INSERT INTO "SharedPostView"/.test(write.text) &&
            /ON CONFLICT \("userId", "postId"\)/.test(write.text)
    );

    check(
        "a repeat view bumps the counter rather than inserting",
        /DO UPDATE/.test(write.text) &&
            /"views" = "SharedPostView"\."views" \+ 1/.test(
                write.text
            )
    );

    check(
        "a repeat view does not move firstViewAt",
        !/"firstViewAt" = /.test(write.text),
        "reach is bucketed on firstViewAt; overwriting it would rewrite history"
    );

    check(
        "the author is excluded inside the statement",
        /WHERE post\."userId" <> viewer\.id/.test(write.text),
        "a second round trip for the author check would double the cost of every scroll"
    );

    check(
        "neither id is interpolated into the SQL",
        !write.text.includes("post-abc") &&
            !write.text.includes("123456789012345678")
    );

    check(
        "the post id and viewer id are bound in order",
        write.params[0] === "post-abc" &&
            write.params[1] === "123456789012345678"
    );

    check(
        "the viewer is resolved by discordId, not by internal id",
        /WHERE "discordId" = \$2/.test(write.text)
    );

    section("recordPostView — classifying a no-op write");

    const selfDb = recordingAdapter((text) =>
        text.includes("INSERT INTO")
            ? []
            : [{ authorDiscordId: "123456789012345678" }]
    );
    const selfLib = loadModule(ANALYTICS_PATH, {
        "./database": selfDb,
    });

    check(
        "the author's own view reports self",
        (await selfLib.recordPostView(
            "post-abc",
            "123456789012345678"
        )) === "self"
    );

    check(
        "classifying self costs exactly one extra read",
        selfDb.calls.length === 2,
        `${selfDb.calls.length} statements`
    );

    const goneDb = recordingAdapter(() => []);
    const goneLib = loadModule(ANALYTICS_PATH, {
        "./database": goneDb,
    });

    check(
        "an unknown post reports not-found",
        (await goneLib.recordPostView(
            "nope",
            "123456789012345678"
        )) === "not-found"
    );

    const otherDb = recordingAdapter((text) =>
        text.includes("INSERT INTO")
            ? []
            : [{ authorDiscordId: "999999999999999999" }]
    );
    const otherLib = loadModule(ANALYTICS_PATH, {
        "./database": otherDb,
    });

    check(
        "a write blocked for another reason is not called self",
        (await otherLib.recordPostView(
            "post-abc",
            "123456789012345678"
        )) === "not-found"
    );

    const throwingLib = loadModule(ANALYTICS_PATH, {
        "./database": {
            query: async (text) => {
                if (text.includes("INSERT INTO")) {
                    throw new Error("connection terminated");
                }

                return { rows: [] };
            },
        },
    });

    let threw = false;

    try {
        await throwingLib.recordPostView(
            "post-abc",
            "123456789012345678"
        );
    } catch {
        threw = true;
    }

    check(
        "a database failure propagates rather than reporting success",
        threw,
        "the route swallows it; the lib must not claim a view that never landed"
    );

    section("getCreatorAnalytics — account resolution");

    const unknownDb = recordingAdapter(() => []);
    const unknownLib = loadModule(ANALYTICS_PATH, {
        "./database": unknownDb,
    });

    check(
        "a malformed discord id returns null with no query",
        (await unknownLib.getCreatorAnalytics("nope")) === null &&
            unknownDb.calls.length === 0
    );

    const noAccountDb = recordingAdapter(() => []);
    const noAccountLib = loadModule(ANALYTICS_PATH, {
        "./database": noAccountDb,
    });

    check(
        "an unknown account returns null",
        (await noAccountLib.getCreatorAnalytics(
            "123456789012345678"
        )) === null
    );

    check(
        "the lookup is by discordId and stops after the account",
        noAccountDb.calls.length === 1 &&
            /FROM "User"/.test(noAccountDb.calls[0].text) &&
            noAccountDb.calls[0].params[0] === "123456789012345678"
    );

    section("getCreatorAnalytics — window clamping");

    /*
     * The account lookup is the only statement that reads "User" without
     * also reading "SharedPost", which is how the fake tells them apart.
     */
    function windowCalls(days) {
        const adapter = recordingAdapter((text) =>
            /FROM "User"/.test(text) &&
            !text.includes("SharedPost")
                ? [{ id: "user-1" }]
                : []
        );

        const module = loadModule(ANALYTICS_PATH, {
            "./database": adapter,
        });

        return module
            .getCreatorAnalytics(
                "123456789012345678",
                days === undefined ? {} : { days }
            )
            .then(() => adapter.calls);
    }

    const defaults = await windowCalls(undefined);

    check(
        "the account lookup plus three aggregate reads run",
        defaults.length === 4,
        `${defaults.length} statements`
    );

    check(
        "the default window is 30 days",
        defaults[3].params[1] === 30,
        String(defaults[3].params[1])
    );

    check(
        "the per-post read is bound with the window and a row cap",
        defaults[2].params[1] === 30 &&
            defaults[2].params[2] === 50
    );

    check(
        "the totals read takes only the user id",
        defaults[1].params.length === 1,
        "lifetime totals must not move with the window"
    );

    for (const [input, expected] of [
        [0, 1],
        [-5, 1],
        [0.4, 1],
        [7, 7],
        [90, 90],
        [999, 90],
        [Number.NaN, 30],
    ]) {
        const calls = await windowCalls(input);

        check(
            `days=${String(input)} is clamped to ${expected}`,
            calls[3].params[1] === expected &&
                calls[2].params[1] === expected,
            `trend got ${calls[3].params[1]}, posts got ${calls[2].params[1]}`
        );
    }

    section("getCreatorAnalytics — statement shape");

    const calls = await windowCalls(14);

    for (const [index, label] of [
        [1, "totals"],
        [2, "per-post"],
        [3, "trend"],
    ]) {
        const call = calls[index];

        check(
            `${label}: every placeholder is supplied`,
            highestPlaceholder(call.text) === call.params.length,
            `${highestPlaceholder(call.text)} placeholders, ${call.params.length} params`
        );

        check(
            `${label}: the user id is bound, not concatenated`,
            call.params[0] === "user-1" &&
                !call.text.includes("user-1")
        );
    }

    const posts = calls[2];

    check(
        "per-post rows are capped",
        /LIMIT \$3/.test(posts.text)
    );

    check(
        "per-post window views are filtered by the window",
        /"lastViewAt"\s*>=\s*NOW\(\) - \(\$2::int \* INTERVAL '1 day'\)/.test(
            posts.text
        )
    );

    check(
        "per-post lifetime reach is not filtered by the window",
        /FROM "SharedPostView" vv/.test(posts.text) &&
            /WHERE vv\."postId" = sp\.id/.test(posts.text)
    );

    check(
        "per-post window views are summed, not counted",
        /COALESCE\(SUM\(vw\."views"\), 0\)::bigint AS "windowViews"/.test(
            posts.text
        ),
        "counting rows would report one viewer as one impression"
    );

    const totals = calls[1];

    check(
        "totals count reach and impressions from the same table",
        /FROM "SharedPostView" v/.test(totals.text) &&
            /COUNT\(\*\)::bigint AS "reach"/.test(totals.text) &&
            /SUM\(v\."views"\)/.test(totals.text)
    );

    check(
        "totals are not windowed",
        !totals.text.includes("INTERVAL"),
        "the totals statement should not mention a time window at all"
    );

    check(
        "engagers are deduplicated across likes, comments and remixes",
        /COUNT\(DISTINCT actor\."id"\)/.test(totals.text) &&
            (totals.text.match(/\bUNION\b/g) || []).length === 3
    );

    const trend = calls[3];

    check(
        "the trend is generated from the window, not from data",
        /generate_series\(\s*0,\s*\$2::int - 1,\s*1\s*\)/.test(
            trend.text
        ),
        "a trend derived only from rows would silently omit quiet days"
    );

    check(
        "the trend counts impressions, not viewers",
        /COALESCE\(SUM\(v\."views"\), 0\)::bigint AS "views"/.test(
            trend.text
        )
    );

    check(
        "reach is bucketed on firstViewAt",
        /DATE_TRUNC\('day', v\."firstViewAt"\)/.test(trend.text)
    );

    check(
        "impressions are bucketed on lastViewAt",
        /DATE_TRUNC\('day', v\."lastViewAt"\)/.test(trend.text)
    );

    check(
        "the trend is ordered oldest first",
        /ORDER BY bucket\.day ASC/.test(trend.text)
    );
}

async function withDatabase() {
    section("against the database");

    let Client;
    let connectionString;

    try {
        require("dotenv").config({
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

    const lib = loadModule(ANALYTICS_PATH, {
        "./database": adapter,
    });

    const AUTHOR_ID = "900000000000000911";
    const VIEWER_ID = "900000000000000912";
    const OTHER_ID = "900000000000000913";
    const STRANGER_ID = "900000000000000999";

    const AUTHOR = "creator-analytics-author";
    const VIEWER = "creator-analytics-viewer";
    const OTHER = "creator-analytics-other";
    const STRANGER = "creator-analytics-stranger";

    const POST_ONE = "creator-analytics-post-1";
    const POST_TWO = "creator-analytics-post-2";

    const ACCOUNTS = [AUTHOR, VIEWER, OTHER, STRANGER];

    async function cleanup() {
        await client.query(
            `
            DELETE FROM "SharedPostView"
            WHERE "userId" = ANY($1)
               OR "postId" = ANY($2)
            `,
            [ACCOUNTS, [POST_ONE, POST_TWO]]
        );

        await client.query(
            `
            DELETE FROM "SharedPostLike"
            WHERE "userId" = ANY($1)
               OR "postId" = ANY($2)
            `,
            [ACCOUNTS, [POST_ONE, POST_TWO]]
        );

        await client.query(
            `
            DELETE FROM "SharedPostComment"
            WHERE "userId" = ANY($1)
               OR "postId" = ANY($2)
            `,
            [ACCOUNTS, [POST_ONE, POST_TWO]]
        );

        await client.query(
            `DELETE FROM "SharedPost" WHERE id = ANY($1)`,
            [[POST_ONE, POST_TWO]]
        );

        await client.query(
            `DELETE FROM "User" WHERE id = ANY($1)`,
            [ACCOUNTS]
        );
    }

    try {
        await cleanup();

        for (const [id, discordId, name] of [
            [AUTHOR, AUTHOR_ID, "cauthor"],
            [VIEWER, VIEWER_ID, "cviewer"],
            [OTHER, OTHER_ID, "cother"],
        ]) {
            await client.query(
                `
                INSERT INTO "User" (
                    id, "discordId", username, "displayName",
                    "createdAt", "updatedAt"
                )
                VALUES ($1, $2, $3, $3, NOW(), NOW())
                `,
                [id, discordId, name]
            );
        }

        await client.query(
            `
            INSERT INTO "SharedPost" (
                id, "userId", "itemType", "itemId", caption, tags,
                "likeCount", "commentCount", "createdAt", "updatedAt"
            )
            VALUES
                (
                    $1, $3, 'PALETTE', 'ca-item-1', 'first post',
                    ARRAY['cozy'], 2, 1, NOW(), NOW()
                ),
                (
                    $2, $3, 'AESTHETIC', 'ca-item-2', 'second post',
                    ARRAY[]::text[], 0, 0, NOW(), NOW()
                )
            `,
            [POST_ONE, POST_TWO, AUTHOR]
        );

        check(
            "the author viewing their own post is refused",
            (await lib.recordPostView(POST_ONE, AUTHOR_ID)) ===
                "self"
        );

        check(
            "a stranger viewing a real post is recorded",
            (await lib.recordPostView(POST_ONE, VIEWER_ID)) ===
                "recorded"
        );

        check(
            "a second view from the same account still reports recorded",
            (await lib.recordPostView(POST_ONE, VIEWER_ID)) ===
                "recorded"
        );

        const collapsed = await client.query(
            `
            SELECT COUNT(*)::int AS "row_count",
                   COALESCE(SUM("views"), 0)::int AS "views"
            FROM "SharedPostView"
            WHERE "postId" = $1
            `,
            [POST_ONE]
        );

        check(
            "repeat views collapse into one row",
            collapsed.rows[0].row_count === 1,
            `${collapsed.rows[0].row_count} rows`
        );

        check(
            "the collapsed row counts both impressions",
            collapsed.rows[0].views === 2,
            String(collapsed.rows[0].views)
        );

        check(
            "a view of a second post is its own row",
            (await lib.recordPostView(POST_TWO, OTHER_ID)) ===
                "recorded"
        );

        check(
            "an unknown post reports not-found",
            (await lib.recordPostView(
                "creator-analytics-missing",
                VIEWER_ID
            )) === "not-found"
        );

        check(
            "a viewer with no Studio account reports not-found",
            (await lib.recordPostView(POST_ONE, STRANGER_ID)) ===
                "not-found"
        );

        const viewerRow = await client.query(
            `SELECT id FROM "User" WHERE "discordId" = $1`,
            [VIEWER_ID]
        );

        await client.query(
            `
            INSERT INTO "SharedPostLike" ("userId", "postId", "createdAt")
            VALUES ($1, $2, NOW())
            `,
            [viewerRow.rows[0].id, POST_ONE]
        );

        const analytics =
            await lib.getCreatorAnalytics(AUTHOR_ID);

        check(
            "the analytics resolve for the author",
            analytics !== null
        );

        check(
            "post count is right",
            analytics?.totals.postCount === 2,
            String(analytics?.totals.postCount)
        );

        check(
            "reach counts people, not impressions",
            analytics?.totals.reach === 2,
            String(analytics?.totals.reach)
        );

        check(
            "impressions count every view",
            analytics?.totals.views === 3,
            String(analytics?.totals.views)
        );

        check(
            "lifetime likes and comments come from the posts",
            analytics?.totals.likes === 2 &&
                analytics?.totals.comments === 1,
            `likes ${analytics?.totals.likes}, comments ${analytics?.totals.comments}`
        );

        check(
            "an account that engaged is counted once",
            analytics?.totals.engagers === 1,
            String(analytics?.totals.engagers)
        );

        check(
            "firstViewAt is set once views exist",
            analytics?.firstViewAt instanceof Date,
            String(analytics?.firstViewAt)
        );

        const first = analytics?.posts.find(
            (row) => row.postId === POST_ONE
        );

        check(
            "per-post rows are ordered by impressions",
            analytics?.posts[0]?.postId === POST_ONE,
            String(analytics?.posts[0]?.postId)
        );

        check(
            "the top post has its own reach and impressions",
            first?.reach === 1 && first?.views === 2,
            `reach ${first?.reach}, views ${first?.views}`
        );

        check(
            "window views are populated inside a 30-day window",
            first?.windowViews === 2,
            String(first?.windowViews)
        );

        check(
            "item type and id come back for linking",
            first?.itemType === "PALETTE" &&
                first?.itemId === "ca-item-1",
            `${first?.itemType} / ${first?.itemId}`
        );

        check(
            "both posts are listed",
            analytics?.posts.length === 2,
            String(analytics?.posts.length)
        );

        const week = await lib.getCreatorAnalytics(AUTHOR_ID, {
            days: 7,
        });

        check(
            "the window does not change lifetime totals",
            week?.totals.likes === analytics?.totals.likes &&
                week?.totals.reach === analytics?.totals.reach
        );

        check(
            "a 7-day trend has seven buckets",
            week?.trend.length === 7,
            String(week?.trend.length)
        );

        check(
            "a 30-day trend has thirty buckets",
            analytics?.trend.length === 30,
            String(analytics?.trend.length)
        );

        const last =
            analytics?.trend[analytics.trend.length - 1];

        check(
            "today is the last bucket",
            last?.day ===
                new Date().toISOString().slice(0, 10),
            String(last?.day)
        );

        check(
            "today's bucket holds the views",
            last?.views === 3 && last?.reach === 2,
            `views ${last?.views}, reach ${last?.reach}`
        );

        check(
            "quiet days are present as zeroes rather than missing",
            analytics?.trend.filter(
                (point) => point.views === 0
            ).length === 29,
            String(
                analytics?.trend.filter(
                    (point) => point.views === 0
                ).length
            )
        );

        check(
            "trend days are YYYY-MM-DD strings",
            /^\d{4}-\d{2}-\d{2}$/.test(
                analytics?.trend[0]?.day ?? ""
            )
        );

        check(
            "an account with no Studio row returns null",
            (await lib.getCreatorAnalytics(STRANGER_ID)) ===
                null
        );

        const viewerAnalytics =
            await lib.getCreatorAnalytics(VIEWER_ID);

        check(
            "a viewer with nothing published gets zeroes, not null",
            viewerAnalytics !== null &&
                viewerAnalytics.totals.postCount === 0 &&
                viewerAnalytics.totals.reach === 0 &&
                viewerAnalytics.totals.views === 0
        );

        check(
            "a fresh account has no firstViewAt",
            viewerAnalytics?.firstViewAt === null
        );

        check(
            "watching other people's work does not credit the watcher",
            viewerAnalytics?.totals.views === 0
        );

        check(
            "a viewer still gets a full trend of zeroes",
            viewerAnalytics?.trend.length === 30 &&
                viewerAnalytics.trend.every(
                    (point) => point.views === 0
                )
        );
    } catch (error) {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m database section threw — ${error.stack || error.message}`
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
        "\n\x1b[1mCreator analytics verification\x1b[0m"
    );

    await offline();
    await withDatabase();

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed > 0 ? 1 : 0);
})();
