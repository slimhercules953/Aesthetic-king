#!/usr/bin/env node
/**
 * Phase 6 verification for the Crown earning layer.
 *
 * `studio/lib/crownEarning.ts` is the only place that decides when Crowns
 * come into existence, and the interesting risks are all about money:
 * an event that pays twice, a source that pays without limit, or an award
 * that throws and takes a user's publish down with it. None of those can be
 * checked against a real Postgres in CI, so this script loads the real
 * module with the Studio's own esbuild and swaps `./database` for a fake
 * that implements just enough SQL to exercise the branches.
 *
 * The fake is deliberately a ledger, not a mock with canned answers: it
 * stores rows and answers the cap query by summing them, so a bug where the
 * award writes the wrong amount or the wrong source shows up as a wrong
 * cap rather than passing silently.
 *
 * Asserted behavior:
 *
 *   1. Rule table shape: every source is capped, positive, and has a label.
 *   2. An award writes one EARN row with the rule's amount and source.
 *   3. A repeated idempotency key pays once (fast path and in-transaction).
 *   4. Per-source daily caps stop the award with reason "source_cap".
 *   5. The global daily cap stops it with reason "daily_cap".
 *   6. An unknown user is not awarded, and a database failure never throws.
 *   7. The self-like / self-comment rules pay nobody; a real like or
 *      comment pays the author.
 *   8. Publish is keyed on the item, so unshare + re-share cannot re-earn.
 *   9. Daily visit and Top.gg keys are day-scoped.
 *  10. getEarnStatus reports per-source progress and what is left.
 *  10b. A source that cannot fire on this deployment is not advertised.
 *  11. Awards stay inside the ledger's rules.
 *  12. The Top.gg webhook handler: auth, payload validation, dedupe.
 *
 * Usage: node scripts/testCrownEarning.js
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

const EARNING_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "crownEarning.ts"
);

const FEATURES_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "features.ts"
);

const TOPGG_ROUTE_PATH = path.join(
    ROOT,
    "studio",
    "app",
    "api",
    "webhooks",
    "topgg",
    "route.ts"
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
        if (
            Object.prototype.hasOwnProperty.call(
                stubRequire,
                specifier
            )
        ) {
            return stubRequire[specifier];
        }

        if (specifier.startsWith(".")) {
            const base = path.resolve(
                path.dirname(modulePath),
                specifier
            );

            for (const candidate of [
                base,
                `${base}.json`,
                `${base}.ts`,
                path.join(base, "index.ts"),
            ]) {
                if (
                    fs.existsSync(candidate) &&
                    fs.statSync(candidate).isFile()
                ) {
                    return candidate.endsWith(".json")
                        ? JSON.parse(
                            fs.readFileSync(candidate, "utf8")
                        )
                        : loadModule(candidate, stubRequire);
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

/* ------------------------------------------------------------------ */
/* A tiny ledger that answers the handful of queries the module runs    */
/* ------------------------------------------------------------------ */

function createDb(options = {}) {
    const state = {
        users: new Map(
            options.users ?? [
                ["owner", "u-owner"],
                ["liker", "u-liker"],
            ]
        ),

        /** @type {{userId:string,type:string,amount:number,source:string|null,idempotencyKey:string|null,createdAt:Date}[]} */
        rows: [],

        /** Set to an Error to make every query reject. */
        failWith: options.failWith ?? null,

        txCount: 0,
        lockCount: 0,
    };

    function run(sql, params = []) {
        if (state.failWith) {
            throw state.failWith;
        }

        const text = String(sql).replace(/\s+/g, " ").trim();

        if (text.includes('FOR UPDATE')) {
            state.lockCount += 1;

            const id = state.users.get(params[0]);

            return {
                rows: id ? [{ id }] : [],
                rowCount: id ? 1 : 0,
            };
        }

        if (
            text.includes("FROM \"CrownTransaction\"") &&
            text.includes("\"idempotencyKey\" = $2")
        ) {
            const byUserId = text.includes('"userId" = $1');

            const match = state.rows.find((row) =>
                byUserId
                    ? row.userId === params[0] &&
                        row.idempotencyKey === params[1]
                    : state.users.get(params[0]) === row.userId &&
                        row.idempotencyKey === params[1]
            );

            return {
                rows: match ? [{ id: match.id }] : [],
                rowCount: match ? 1 : 0,
            };
        }

        if (text.includes("AS source_count")) {
            const userId = params[0];
            const source = params[1];
            const since = new Date(params[2]).getTime();

            const todays = state.rows.filter(
                (row) =>
                    row.userId === userId &&
                    row.type === "EARN" &&
                    row.createdAt.getTime() >= since
            );

            return {
                rows: [
                    {
                        source_count: todays.filter(
                            (row) => row.source === source
                        ).length,

                        total_amount: todays.reduce(
                            (sum, row) => sum + row.amount,
                            0
                        ),
                    },
                ],

                rowCount: 1,
            };
        }

        if (text.includes("INSERT INTO \"CrownTransaction\"")) {
            const row = {
                id: `tx-${state.rows.length + 1}`,
                userId: params[1],
                type: "EARN",
                amount: params[2],
                reason: params[3],
                source: params[4],
                idempotencyKey: params[5],
                createdAt: new Date(),
            };

            state.rows.push(row);

            return {
                rows: [
                    {
                        id: row.id,
                        type: row.type,
                        amount: row.amount,
                        reason: row.reason,
                        source: row.source,
                        createdAt: row.createdAt,
                    },
                ],

                rowCount: 1,
            };
        }

        if (text.includes("GROUP BY ct.source")) {
            const userId = state.users.get(params[0]);
            const since = new Date(params[1]).getTime();

            const todays = state.rows.filter(
                (row) =>
                    row.userId === userId &&
                    row.type === "EARN" &&
                    row.createdAt.getTime() >= since
            );

            const bySource = new Map();

            for (const row of todays) {
                const entry = bySource.get(row.source) ?? {
                    awarded: 0,
                    total: 0,
                };

                entry.awarded += 1;
                entry.total += row.amount;

                bySource.set(row.source, entry);
            }

            return {
                rows: [...bySource.entries()].map(
                    ([source, entry]) => ({
                        source,
                        awarded: entry.awarded,
                        total: entry.total,
                    })
                ),

                rowCount: bySource.size,
            };
        }

        throw new Error(
            `unhandled SQL in test fake: ${text.slice(0, 120)}`
        );
    }

    return {
        state,

        query: async (sql, params) => run(sql, params),

        withTransaction: async (fn) => {
            state.txCount += 1;

            return fn({
                query: async (sql, params) => run(sql, params),
            });
        },
    };
}

function load(db) {
    return loadModule(EARNING_PATH, {
        "./database": {
            query: db.query,
            withTransaction: db.withTransaction,
        },
    });
}

const day = new Date().toISOString().slice(0, 10);

(async () => {
    /* ---------------------------------------------------------------- */
    section("1. Rule table");

    const db0 = createDb();
    const earning = load(db0);

    const sources = earning.CROWN_EARN_SOURCES;

    check(
        "every source has a rule",
        sources.every(
            (source) =>
                earning.CROWN_EARN_RULES[source]?.source === source
        )
    );

    check(
        "every amount is a positive integer",
        sources.every((source) => {
            const amount =
                earning.CROWN_EARN_RULES[source].amount;

            return Number.isInteger(amount) && amount > 0;
        })
    );

    check(
        "every source is capped per day",
        sources.every(
            (source) =>
                Number.isFinite(
                    earning.CROWN_EARN_RULES[source].dailyCap
                ) &&
                earning.CROWN_EARN_RULES[source].dailyCap > 0
        )
    );

    check(
        "every source has a human label",
        sources.every(
            (source) =>
                typeof earning.CROWN_EARN_RULES[source].label ===
                "string"
        ) &&
        sources.every(
            (source) =>
                earning.CROWN_EARN_RULES[source].label.length > 3
        )
    );

    const sumOfCaps = sources.reduce(
        (sum, source) =>
            sum +
            earning.CROWN_EARN_RULES[source].amount *
            earning.CROWN_EARN_RULES[source].dailyCap,
        0
    );

    check(
        "the global cap is below the sum of the per-source caps",
        earning.CROWN_EARN_DAILY_TOTAL_CAP < sumOfCaps,
        `cap ${earning.CROWN_EARN_DAILY_TOTAL_CAP} vs ${sumOfCaps}`
    );

    check(
        "the global cap is reachable",
        earning.CROWN_EARN_DAILY_TOTAL_CAP >=
        Math.max(
            ...sources.map(
                (source) =>
                    earning.CROWN_EARN_RULES[source].amount
            )
        )
    );

    check(
        "the monthly ceiling is the daily cap times the longest month",
        earning.CROWN_MONTH_MAX_EARN ===
        earning.CROWN_EARN_DAILY_TOTAL_CAP * 31
    );

    check(
        "the minimum month cost is twice the monthly ceiling",
        earning.CROWN_MONTH_MIN_COST ===
        earning.CROWN_MONTH_MAX_EARN * 2
    );

    /* ---------------------------------------------------------------- */
    section("1b. Crowns cannot add up to a free month of Premium");

    /*
     * The product rule this guards: a month of Crown-buyable access has
     * to cost more than twice what the most active account on the
     * platform can earn in a month. Below that, farming becomes a way of
     * not paying, and a user who saves up can run several months back to
     * back without earning anything.
     *
     * Only TIMED unlocks are counted. A BOOST is windowed and dies with
     * the period, so it can never be banked into future access, and the
     * allowances are all well under what the plan itself grants.
     */
    const features = loadModule(FEATURES_PATH);

    const timed = features.FEATURE_IDS
        .map((feature) => ({
            feature,
            terms: features.getCrownUnlockTerms(feature),
        }))
        .filter((entry) => entry.terms?.kind === "TIMED");

    check(
        "there is something Crowns can buy a month of",
        timed.length > 0
    );

    const monthCost = timed.reduce(
        (sum, entry) => sum + entry.terms.cost,
        0
    );

    check(
        "a month of everything Crowns can buy costs at least twice a month of maximum earning",
        monthCost >= earning.CROWN_MONTH_MIN_COST,
        `costs ${monthCost}, floor ${earning.CROWN_MONTH_MIN_COST}`
    );

    for (const entry of timed) {
        check(
            `${entry.feature} alone costs more than a month of maximum earning`,
            entry.terms.cost > earning.CROWN_MONTH_MAX_EARN,
            `${entry.terms.cost} vs ${earning.CROWN_MONTH_MAX_EARN}`
        );

        check(
            `${entry.feature} is sold in periods of a month or less`,
            entry.terms.days > 0 && entry.terms.days <= 31,
            `${entry.terms.days} days`
        );
    }

    for (const feature of features.FEATURE_IDS) {
        const terms =
            features.getCrownUnlockTerms(feature);

        if (terms?.kind !== "BOOST") {
            continue;
        }

        const config = features.FEATURES[feature];

        check(
            `${feature} boosts stay well under what the plan itself allows`,
            Math.floor(
                earning.CROWN_MONTH_MAX_EARN / terms.cost
            ) * terms.allowance < config.premiumLimit,
            `${Math.floor(earning.CROWN_MONTH_MAX_EARN / terms.cost) * terms.allowance} vs plan ${config.premiumLimit}`
        );
    }

    /* ---------------------------------------------------------------- */
    section("2. A qualifying event writes one EARN row");

    const db1 = createDb();
    const e1 = load(db1);

    const first = await e1.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "publish:AESTHETIC:42",
    });

    check("the award is granted", first.awarded === true);
    check(
        "the amount is the rule's amount",
        first.amount ===
        e1.CROWN_EARN_RULES.publish.amount
    );

    check(
        "exactly one ledger row exists",
        db1.state.rows.length === 1
    );

    const row = db1.state.rows[0];

    check("the row type is EARN", row.type === "EARN");
    check(
        "the row carries the source",
        row.source === "publish"
    );
    check(
        "the row carries the idempotency key",
        row.idempotencyKey === "publish:AESTHETIC:42"
    );
    check(
        "the amount stored is positive",
        row.amount > 0,
        String(row.amount)
    );

    /* ---------------------------------------------------------------- */
    section("3. Idempotency");

    const again = await e1.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "publish:AESTHETIC:42",
    });

    check(
        "a replay is reported as a duplicate",
        again.awarded === false && again.reason === "duplicate"
    );

    check(
        "the replay wrote nothing",
        db1.state.rows.length === 1
    );

    const before = db1.state.lockCount;

    await e1.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "publish:AESTHETIC:42",
    });

    check(
        "the replay took the cheap path (no row lock)",
        db1.state.lockCount === before,
        `locks ${before} -> ${db1.state.lockCount}`
    );

    const txBefore = db1.state.txCount;

    await e1.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "publish:AESTHETIC:99",
    });

    check(
        "a different key still opens a transaction",
        db1.state.txCount === txBefore + 1
    );

    check(
        "an empty key is refused without touching the database",
        (
            await e1.awardCrowns("owner", {
                source: "publish",
                idempotencyKey: "   ",
            })
        ).awarded === false
    );

    /* ---------------------------------------------------------------- */
    section("4. Per-source daily cap");

    const db2 = createDb();
    const e2 = load(db2);

    const cap = e2.CROWN_EARN_RULES.like_received.dailyCap;

    let granted = 0;
    let lastReason = null;

    for (let i = 0; i < cap + 3; i += 1) {
        const result = await e2.awardCrowns("owner", {
            source: "like_received",
            idempotencyKey: `like_received:post-${i}:liker`,
        });

        if (result.awarded) {
            granted += 1;
        } else {
            lastReason = result.reason;
        }
    }

    check(
        `exactly ${cap} awards from a source capped at ${cap}`,
        granted === cap,
        `granted ${granted}`
    );

    check(
        "the refusal after the cap is source_cap",
        lastReason === "source_cap",
        String(lastReason)
    );

    /* ---------------------------------------------------------------- */
    section("5. Global daily cap");

    const db3 = createDb();
    const e3 = load(db3);

    // Fill the day from the best-paid source first, then top up with
    // comments, so the day lands exactly on the global cap.
    for (let i = 0; i < 10; i += 1) {
        await e3.awardCrowns("owner", {
            source: "publish",
            idempotencyKey: `publish:AESTHETIC:${i}`,
        });
    }

    let globalRefusal = null;

    for (let i = 0; i < 10; i += 1) {
        const result = await e3.awardCrowns("owner", {
            source: "comment_received",
            idempotencyKey: `comment_received:c${i}`,
        });

        if (!result.awarded) {
            globalRefusal = result.reason;
            break;
        }
    }

    const totalWritten = db3.state.rows.reduce(
        (sum, r) => sum + r.amount,
        0
    );

    check(
        "the day fills exactly to the cap",
        totalWritten === e3.CROWN_EARN_DAILY_TOTAL_CAP,
        `wrote ${totalWritten} of ${e3.CROWN_EARN_DAILY_TOTAL_CAP}`
    );

    check(
        "the refusal at the cap is daily_cap",
        globalRefusal === "daily_cap",
        String(globalRefusal)
    );

    const overflow = await e3.awardCrowns("owner", {
        source: "like_received",
        idempotencyKey: "like_received:post-9:liker",
    });

    check(
        "a fresh source is still refused at the global cap",
        overflow.awarded === false &&
        overflow.reason === "daily_cap",
        String(overflow.reason)
    );

    check(
        "nothing was written past the cap",
        db3.state.rows.reduce(
            (sum, r) => sum + r.amount,
            0
        ) === e3.CROWN_EARN_DAILY_TOTAL_CAP
    );

    /* ---------------------------------------------------------------- */
    section("6. Unknown users and failures");

    const db4 = createDb({ users: [["owner", "u-owner"]] });
    const e4 = load(db4);

    const ghost = await e4.awardCrowns("nobody", {
        source: "publish",
        idempotencyKey: "publish:AESTHETIC:1",
    });

    check(
        "an account that has never signed in is not awarded",
        ghost.awarded === false
    );

    check(
        "and no row is written for it",
        db4.state.rows.length === 0
    );

    const db5 = createDb({ failWith: new Error("db down") });
    const e5 = load(db5);

    let threw = false;
    let outcome = null;

    try {
        outcome = await e5.awardCrowns("owner", {
            source: "publish",
            idempotencyKey: "publish:AESTHETIC:7",
        });
    } catch {
        threw = true;
    }

    check(
        "a database failure never throws out of awardCrowns",
        threw === false
    );

    check(
        "and reports a non-award instead",
        outcome?.awarded === false
    );

    /* ---------------------------------------------------------------- */
    section("7. Engagement pays the author, never the actor");

    const db6 = createDb();
    const e6 = load(db6);

    await e6.awardForLike("owner", "owner", "post-1");
    check(
        "a self-like pays nothing",
        db6.state.rows.length === 0
    );

    await e6.awardForLike("", "liker", "post-1");
    check(
        "a missing author pays nothing",
        db6.state.rows.length === 0
    );

    await e6.awardForLike("owner", "liker", "post-1");
    check(
        "a real like pays the author",
        db6.state.rows.length === 1 &&
        db6.state.rows[0].userId === "u-owner"
    );

    await e6.awardForLike("owner", "liker", "post-1");
    check(
        "unliking and re-liking the same post cannot re-earn",
        db6.state.rows.length === 1
    );

    await e6.awardForLike("owner", "owner", "post-2");
    check(
        "liking a different own post still pays nothing",
        db6.state.rows.length === 1
    );

    await e6.awardForComment("owner", "owner", "comment-1");
    check(
        "a self-comment pays nothing",
        db6.state.rows.length === 1
    );

    await e6.awardForComment("owner", "liker", "comment-1");
    check(
        "a real comment pays the author",
        db6.state.rows.length === 2
    );

    await e6.awardForComment("owner", "liker", "comment-1");
    check(
        "the same comment id pays once",
        db6.state.rows.length === 2
    );

    /* ---------------------------------------------------------------- */
    section("8. Publishing is keyed on the item, not the post row");

    const db7 = createDb();
    const e7 = load(db7);

    await e7.awardForPublish("owner", "AESTHETIC", "42");
    await e7.awardForPublish("owner", "AESTHETIC", "42");

    check(
        "re-sharing the same item pays once",
        db7.state.rows.length === 1
    );

    await e7.awardForPublish("owner", "PALETTE", "42");

    check(
        "a different item type with the same id is a different item",
        db7.state.rows.length === 2
    );

    await e7.awardForPublish("owner", "", "42");
    await e7.awardForPublish("owner", "AESTHETIC", "");

    check(
        "a missing item cannot be awarded",
        db7.state.rows.length === 2
    );

    /* ---------------------------------------------------------------- */
    section("9. Day-scoped keys");

    const db8 = createDb();
    const e8 = load(db8);

    await e8.awardForDailyVisit("owner");
    await e8.awardForDailyVisit("owner");

    check(
        "the daily visit pays once however many pages load",
        db8.state.rows.length === 1
    );

    check(
        "the visit key names today",
        db8.state.rows[0].idempotencyKey ===
        `daily_visit:${day}`,
        db8.state.rows[0].idempotencyKey
    );

    await e8.awardForTopggVote("liker");
    await e8.awardForTopggVote("liker");
    await e8.awardForTopggVote("");

    check(
        "a voter is paid once per day no matter how many webhooks arrive",
        db8.state.rows.length === 2
    );

    check(
        "the vote key names today",
        db8.state.rows[1].idempotencyKey ===
        `topgg_vote:liker:${day}`,
        db8.state.rows[1].idempotencyKey
    );

    check(
        "the vote pays the voter",
        db8.state.rows[1].userId === "u-liker"
    );

    /* ---------------------------------------------------------------- */
    section("10. getEarnStatus");

    const db9 = createDb();
    const e9 = load(db9);

    const status0 = await e9.getEarnStatus("owner");

    check(
        "one entry per live source",
        status0.sources.length ===
        e9.CROWN_EARN_SOURCES.filter((s) =>
            e9.isEarnSourceLive(s)
        ).length
    );

    check(
        "a fresh day shows nothing earned",
        status0.earnedToday === 0
    );

    check(
        "and every source is fully available",
        status0.sources.every(
            (s) => s.remaining === s.dailyCap
        )
    );

    check(
        "the daily total reported is the cap",
        status0.dailyRemaining ===
        e9.CROWN_EARN_DAILY_TOTAL_CAP
    );

    await e9.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "publish:AESTHETIC:1",
    });

    await e9.awardCrowns("owner", {
        source: "like_received",
        idempotencyKey: "like_received:p1:liker",
    });

    const status1 = await e9.getEarnStatus("owner");

    const publish = status1.sources.find(
        (s) => s.source === "publish"
    );

    check(
        "the awarded source is counted",
        publish.awardedToday === 1 &&
        publish.remaining === publish.dailyCap - 1
    );

    check(
        "crownsRemaining is remaining times the amount",
        publish.crownsRemaining ===
        publish.remaining * publish.amount
    );

    check(
        "earnedToday is the sum of today's awards",
        status1.earnedToday ===
        e9.CROWN_EARN_RULES.publish.amount +
        e9.CROWN_EARN_RULES.like_received.amount
    );

    check(
        "dailyRemaining fell by what was earned",
        status1.dailyRemaining ===
        e9.CROWN_EARN_DAILY_TOTAL_CAP -
        status1.earnedToday
    );

    const untouched = status1.sources.find(
        (s) => s.source === "comment_received"
    );

    check(
        "an unused source is untouched",
        untouched.awardedToday === 0 &&
        untouched.remaining === untouched.dailyCap
    );

    check(
        "another user's status is unaffected",
        (await e9.getEarnStatus("liker")).earnedToday ===
        0
    );

    /* ---------------------------------------------------------------- */
    section("10b. Sources that cannot fire are not advertised");

    /*
     * A Top.gg vote only arrives if the webhook is configured, and the
     * Studio is not deployed yet. Offering "10 Crowns for voting" when no
     * vote can ever be received is a promise the product cannot keep, so
     * the source disappears with the secret.
     */
    const savedSecret = process.env.TOPGG_WEBHOOK_SECRET;
    delete process.env.TOPGG_WEBHOOK_SECRET;

    check(
        "topgg_vote is not live without the webhook secret",
        e9.isEarnSourceLive("topgg_vote") === false
    );

    check(
        "every other source is always live",
        e9.CROWN_EARN_SOURCES.filter(
            (s) => s !== "topgg_vote"
        ).every((s) => e9.isEarnSourceLive(s))
    );

    const hidden = await e9.getEarnStatus("owner");

    check(
        "the hidden source is absent from the Earn page",
        !hidden.sources.some(
            (s) => s.source === "topgg_vote"
        )
    );

    check(
        "hiding it does not change what was earned",
        hidden.earnedToday === status1.earnedToday
    );

    process.env.TOPGG_WEBHOOK_SECRET = "a-secret";

    check(
        "configuring the webhook brings it back",
        e9.isEarnSourceLive("topgg_vote") === true
    );

    const shown = await e9.getEarnStatus("owner");

    check(
        "and it appears as a fresh source",
        shown.sources.find(
            (s) => s.source === "topgg_vote"
        )?.awardedToday === 0 &&
        shown.sources.length === hidden.sources.length + 1
    );

    /*
     * A row already paid under a source must stay visible even once the
     * source is hidden again, or the history would silently shrink.
     */
    await e9.awardCrowns("owner", {
        source: "topgg_vote",
        idempotencyKey: "topgg_vote:voter:today",
    });

    delete process.env.TOPGG_WEBHOOK_SECRET;

    const afterHide = await e9.getEarnStatus("owner");

    check(
        "a source with history is shown even when not live",
        afterHide.sources.find(
            (s) => s.source === "topgg_vote"
        )?.awardedToday === 1
    );

    check(
        "and its Crowns still count toward today",
        afterHide.earnedToday ===
        status1.earnedToday +
        e9.CROWN_EARN_RULES.topgg_vote.amount
    );

    if (savedSecret === undefined) {
        delete process.env.TOPGG_WEBHOOK_SECRET;
    } else {
        process.env.TOPGG_WEBHOOK_SECRET = savedSecret;
    }

    /* ---------------------------------------------------------------- */
    section("11. Awards stay inside the ledger's rules");

    const db10 = createDb();
    const e10 = load(db10);

    const custom = await e10.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "promo:launch",
        amount: 7,
    });

    check(
        "an explicit amount is honored",
        custom.awarded === true && custom.amount === 7
    );

    const bad = await e10.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "promo:bad",
        amount: 0,
    });

    check(
        "a non-positive amount is refused",
        bad.awarded === false
    );

    const fractional = await e10.awardCrowns("owner", {
        source: "publish",
        idempotencyKey: "promo:half",
        amount: 1.5,
    });

    check(
        "a fractional amount is refused",
        fractional.awarded === false
    );

    check(
        "and neither wrote a row",
        db10.state.rows.length === 1
    );

    /* ---------------------------------------------------------------- */
    section("12. The Top.gg webhook handler");

    const SECRET = "test-webhook-secret";

    function fakeNextServer() {
        return {
            NextResponse: {
                json(body, init) {
                    return {
                        body,
                        status: init?.status ?? 200,
                    };
                },
            },

            NextRequest: function NextRequest() {},
        };
    }

    function fakeRequest({ auth, payload, raw }) {
        return {
            cookies: { get: () => undefined },

            headers: {
                get: (name) =>
                    String(name).toLowerCase() === "authorization"
                        ? auth
                        : null,
            },

            json: async () => {
                if (raw) {
                    throw new Error("not json");
                }

                return payload;
            },
        };
    }

    function loadRoute(db) {
        return loadModule(TOPGG_ROUTE_PATH, {
            "next/server": fakeNextServer(),

            "./database": {
                query: db.query,
                withTransaction: db.withTransaction,
            },
        });
    }

    const dbW = createDb({
        users: [
            ["owner", "u-owner"],
            ["216903735903510528", "u-voter"],
        ],
    });

    const route = loadRoute(dbW);

    const originalSecret =
        process.env.TOPGG_WEBHOOK_SECRET;

    const vote = {
        botId: "123",
        user: "216903735903510528",
        type: "upvote",
    };

    process.env.TOPGG_WEBHOOK_SECRET = "";

    const unconfigured = await route.POST(
        fakeRequest({ auth: SECRET, payload: vote })
    );

    check(
        "an unconfigured deployment answers 404, not 500",
        unconfigured.status === 404,
        String(unconfigured.status)
    );

    process.env.TOPGG_WEBHOOK_SECRET = SECRET;

    const noHeader = await route.POST(
        fakeRequest({ auth: null, payload: vote })
    );

    check(
        "a missing Authorization header is rejected",
        noHeader.status === 401,
        String(noHeader.status)
    );

    const wrongHeader = await route.POST(
        fakeRequest({
            auth: "definitely-not-the-secret",
            payload: vote,
        })
    );

    check(
        "a wrong secret is rejected",
        wrongHeader.status === 401
    );

    check(
        "and nothing was awarded for it",
        dbW.state.rows.length === 0
    );

    const badBody = await route.POST(
        fakeRequest({ auth: SECRET, raw: true })
    );

    check(
        "a malformed body is a 400, not a crash",
        badBody.status === 400,
        String(badBody.status)
    );

    const testVote = await route.POST(
        fakeRequest({
            auth: SECRET,
            payload: { ...vote, type: "test" },
        })
    );

    check(
        "Top.gg's configuration test vote is accepted",
        testVote.status === 200 &&
        testVote.body.ignored === true
    );

    check(
        "and pays nobody",
        dbW.state.rows.length === 0
    );

    const garbageUser = await route.POST(
        fakeRequest({
            auth: SECRET,
            payload: { user: "not-an-id", type: "upvote" },
        })
    );

    check(
        "a non-Discord-id user is rejected",
        garbageUser.status === 400
    );

    const missingUser = await route.POST(
        fakeRequest({
            auth: SECRET,
            payload: { type: "upvote" },
        })
    );

    check(
        "a body with no user is rejected",
        missingUser.status === 400
    );

    const good = await route.POST(
        fakeRequest({ auth: SECRET, payload: vote })
    );

    check(
        "a real vote is accepted",
        good.status === 200 && good.body.ok === true
    );

    check(
        "and the voter is paid",
        dbW.state.rows.length === 1 &&
        dbW.state.rows[0].userId === "u-voter"
    );

    check(
        "with the Top.gg amount",
        dbW.state.rows[0].amount ===
        earning.CROWN_EARN_RULES.topgg_vote.amount
    );

    const replay = await route.POST(
        fakeRequest({ auth: SECRET, payload: vote })
    );

    check(
        "a retried delivery is acknowledged",
        replay.status === 200
    );

    check(
        "but pays only once",
        dbW.state.rows.length === 1
    );

    const stranger = await route.POST(
        fakeRequest({
            auth: SECRET,
            payload: {
                ...vote,
                user: "111111111111111111",
            },
        })
    );

    check(
        "a vote from an unknown account is still acknowledged",
        stranger.status === 200
    );

    check(
        "and invents no ledger row",
        dbW.state.rows.length === 1
    );

    if (originalSecret === undefined) {
        delete process.env.TOPGG_WEBHOOK_SECRET;
    } else {
        process.env.TOPGG_WEBHOOK_SECRET =
            originalSecret;
    }

    /* ---------------------------------------------------------------- */
    const total = passed + failed;

    console.log(
        `\n\x1b[1m${failed === 0 ? "\x1b[32mAll" : "\x1b[31mSome"}\x1b[0m ` +
        `\x1b[1m${passed}/${total} assertions passed.\x1b[0m`
    );

    process.exit(failed === 0 ? 0 : 1);
})();
