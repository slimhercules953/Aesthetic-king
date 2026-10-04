#!/usr/bin/env node
/**
 * Verification for `studio/lib/devTools.ts`, the guard in front of the two
 * routes that mint paid value: `/api/billing/dev-entitlement` (grants
 * Premium) and `/api/crowns/dev-grant` (credits Crowns).
 *
 * This is the smallest file in the Studio with the largest blast radius. If
 * it ever returns true in production, every signed-in Discord account can
 * give itself Premium or an arbitrary Crown balance by posting to a URL, and
 * nothing in the logs would look like a breach — it would look like normal
 * traffic to a legitimate endpoint.
 *
 * So the assertions are all attempts to get a `true` that should be a
 * `false`, in the order an operator would plausibly make the mistake:
 *
 *   1. forget to configure the allowlist,
 *   2. leave the dev flag on in a production deploy,
 *   3. set NODE_ENV to something that is not "development",
 *   4. put the flag in the wrong place (Cloudflare bindings vs process.env),
 *   5. get the string slightly wrong ("TRUE", " true", "1").
 *
 * Usage: node scripts/testDevTools.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const esbuild = require(path.join(ROOT, "studio", "node_modules", "esbuild"));

const LIB_PATH = path.join(ROOT, "studio", "lib", "devTools.ts");
const BILLING_ROUTE = path.join(
    ROOT,
    "studio",
    "app",
    "api",
    "billing",
    "dev-entitlement",
    "route.ts"
);
const CROWNS_ROUTE = path.join(
    ROOT,
    "studio",
    "app",
    "api",
    "crowns",
    "dev-grant",
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
        console.error(`  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`);
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function readSource(file) {
    return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

/* ------------------------------------------------------------------ *
 * Loading the lib with a fake `cloudflare:workers`
 * ------------------------------------------------------------------ */

/**
 * The module reads flags from `env` imported from `cloudflare:workers`, which
 * only exists inside a Worker. The stub is a plain mutable object so a test
 * can set one binding and leave the rest absent, which is exactly how a
 * half-configured deploy looks.
 */
const bindings = {};

function setBindings(next) {
    for (const key of Object.keys(bindings)) {
        delete bindings[key];
    }

    Object.assign(bindings, next || {});
}

function loadDevTools() {
    const result = esbuild.transformSync(readSource(LIB_PATH), {
        loader: "ts",
        format: "cjs",
        target: "node20",
    });

    const module = { exports: {} };

    const req = (specifier) => {
        if (specifier === "cloudflare:workers") {
            return { env: bindings };
        }

        throw new Error(`testDevTools: unexpected import "${specifier}"`);
    };

    new Function("module", "exports", "require", result.code)(
        module,
        module.exports,
        req
    );

    return module.exports;
}

/**
 * Runs `fn` with a clean environment.
 *
 * Both sources of configuration are wiped first: leaving a stray
 * `process.env.NODE_ENV` from the developer's shell (or from CI) would make
 * unrelated assertions pass or fail for reasons that have nothing to do with
 * the code under test.
 */
function withEnv(
    { flag, value = "true", mode, allowlist, bindings: extraBindings },
    fn
) {
    const FLAG_VAR = flag === "crown" ? "CROWN_DEV" : "BILLING_DEV";
    const ALLOW_VAR =
        flag === "crown" ? "DEV_CROWNS_DISCORD_IDS" : "DEV_BILLING_DISCORD_IDS";

    const saved = {};

    for (const name of [
        "CROWN_DEV",
        "BILLING_DEV",
        "DEV_CROWNS_DISCORD_IDS",
        "DEV_BILLING_DISCORD_IDS",
        "NODE_ENV",
    ]) {
        saved[name] = process.env[name];
        delete process.env[name];
    }

    if (mode !== undefined) {
        process.env.NODE_ENV = mode;
    }

    if (flag !== undefined && value !== null) {
        process.env[FLAG_VAR] = value;
    }

    if (allowlist !== undefined) {
        process.env[ALLOW_VAR] = allowlist;
    }

    setBindings(extraBindings);

    try {
        return fn();
    } finally {
        setBindings(null);

        for (const [name, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
}

const OPERATOR = "111111111111111111";
const STRANGER = "999999999999999999";

function enabled(flag, lib, discordId) {
    return flag === "billing"
        ? lib.billingDevToolsEnabled(discordId)
        : lib.crownDevToolsEnabled(discordId);
}

function main() {
    const lib = loadDevTools();

    check(
        "the lib exports both guards",
        typeof lib.billingDevToolsEnabled === "function" &&
            typeof lib.crownDevToolsEnabled === "function"
    );

    /* ---------------------------------------------------------------- */
    section("Nothing configured: everything is denied");

    for (const flag of ["billing", "crown"]) {
        const label = flag === "billing" ? "Premium" : "Crowns";

        check(
            `${label}: no flags at all denies an operator`,
            withEnv(
                { flag, value: null, mode: "development", allowlist: OPERATOR },
                () => enabled(flag, lib, OPERATOR)
            ) === false
        );

        check(
            `${label}: flag on but empty allowlist denies everyone`,
            withEnv({ flag, mode: "development", allowlist: "" }, () =>
                enabled(flag, lib, OPERATOR)
            ) === false
        );

        check(
            `${label}: flag on but allowlist unset denies everyone`,
            withEnv({ flag, mode: "development", allowlist: undefined }, () =>
                enabled(flag, lib, OPERATOR)
            ) === false
        );

        check(
            `${label}: allowlist of only whitespace denies everyone`,
            withEnv({ flag, mode: "development", allowlist: " ,  , " }, () =>
                enabled(flag, lib, OPERATOR)
            ) === false
        );
    }

    /* ---------------------------------------------------------------- */
    section("Production is the default, not the opt-in");

    /*
     * The whole point of `looksLikeProduction()` is that an unset NODE_ENV
     * counts as production. Under Workers, NODE_ENV is frequently absent, so
     * treating absent as "not production" would mean the guard is off by
     * default in the most common real deployment.
     */
    for (const mode of [undefined, "", "production", "staging", "preview", "prod"]) {
        check(
            `NODE_ENV=${JSON.stringify(mode)} denies a fully configured dev setup`,
            withEnv(
                { flag: "billing", mode, allowlist: OPERATOR },
                () => enabled("billing", lib, OPERATOR)
            ) === false
        );
    }

    check(
        "NODE_ENV unset denies Crowns too",
        withEnv({ flag: "crown", mode: undefined, allowlist: OPERATOR }, () =>
            enabled("crown", lib, OPERATOR)
        ) === false
    );

    check(
        'NODE_ENV="development" is accepted',
        withEnv({ flag: "billing", mode: "development", allowlist: OPERATOR }, () =>
            enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        'NODE_ENV="test" is accepted',
        withEnv({ flag: "billing", mode: "test", allowlist: OPERATOR }, () =>
            enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        "NODE_ENV is matched case-insensitively",
        withEnv({ flag: "billing", mode: "Development", allowlist: OPERATOR }, () =>
            enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        "NODE_ENV is whitespace-tolerant",
        withEnv({ flag: "billing", mode: "  development  ", allowlist: OPERATOR }, () =>
            enabled("billing", lib, OPERATOR)
        ) === true
    );

    /* ---------------------------------------------------------------- */
    section("The flag must say exactly true");

    /*
     * A truthy-but-not-"true" value is the most likely operator mistake:
     * `BILLING_DEV=1` or `BILLING_DEV=yes` reads as "on" to a human. Being
     * strict here is cheap in development and, more importantly, keeps the
     * guard's behaviour predictable to whoever reads the deploy config.
     */
    for (const value of ["TRUE", "True", "1", "yes", "on", " true", "true ", "false", "0"]) {
        check(
            `BILLING_DEV=${JSON.stringify(value)} denies`,
            withEnv(
                { flag: "billing", value, mode: "development", allowlist: OPERATOR },
                () => enabled("billing", lib, OPERATOR)
            ) === false
        );
    }

    /* ---------------------------------------------------------------- */
    section("The account must be on the allowlist");

    check(
        "an account not on the allowlist is denied",
        withEnv(
            { flag: "billing", mode: "development", allowlist: OPERATOR },
            () => enabled("billing", lib, STRANGER)
        ) === false
    );

    check(
        "a null discord id is denied",
        withEnv(
            { flag: "billing", mode: "development", allowlist: OPERATOR },
            () => enabled("billing", lib, null)
        ) === false
    );

    check(
        "an undefined discord id is denied",
        withEnv(
            { flag: "billing", mode: "development", allowlist: OPERATOR },
            () => enabled("billing", lib, undefined)
        ) === false
    );

    check(
        "an empty discord id is denied even against a blank allowlist",
        withEnv(
            { flag: "billing", mode: "development", allowlist: " , " },
            () => enabled("billing", lib, "")
        ) === false
    );

    check(
        "a comma-separated allowlist matches each entry",
        withEnv(
            {
                flag: "billing",
                mode: "development",
                allowlist: `${STRANGER},${OPERATOR}`,
            },
            () => enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        "allowlist entries are trimmed",
        withEnv(
            {
                flag: "billing",
                mode: "development",
                allowlist: ` ${OPERATOR} , ${STRANGER} `,
            },
            () => enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        "a substring of an allowlist entry does not match",
        withEnv(
            { flag: "billing", mode: "development", allowlist: OPERATOR },
            () => enabled("billing", lib, OPERATOR.slice(0, 10))
        ) === false
    );

    /* ---------------------------------------------------------------- */
    section("The two flags are independent");

    /*
     * If one guard read the other's variables, enabling Crown seeding for a
     * test would silently switch on the Premium minter as well.
     */
    check(
        "CROWN_DEV does not enable the billing guard",
        withEnv(
            { flag: "crown", mode: "development", allowlist: OPERATOR },
            () => enabled("billing", lib, OPERATOR)
        ) === false
    );

    check(
        "BILLING_DEV does not enable the crowns guard",
        withEnv(
            { flag: "billing", mode: "development", allowlist: OPERATOR },
            () => enabled("crown", lib, OPERATOR)
        ) === false
    );

    check(
        "the crowns allowlist does not satisfy the billing guard",
        withEnv(
            {
                flag: "crown",
                mode: "development",
                allowlist: OPERATOR,
                bindings: { DEV_BILLING_DISCORD_IDS: OPERATOR },
            },
            () => enabled("billing", lib, OPERATOR)
        ) === false
    );

    check(
        "CROWN_DEV with its own allowlist enables Crowns",
        withEnv(
            { flag: "crown", mode: "development", allowlist: OPERATOR },
            () => enabled("crown", lib, OPERATOR)
        ) === true
    );

    /* ---------------------------------------------------------------- */
    section("Either configuration source works");

    /*
     * The rest of the Studio reads process.env; Workers operators set
     * bindings. Reading only one of them previously meant an operator setting
     * the flag "the usual way" got the opposite of what they intended, so both
     * must work.
     */
    check(
        "a flag set only in Cloudflare bindings is read",
        withEnv(
            {
                flag: "billing",
                value: null,
                mode: "development",
                allowlist: OPERATOR,
                bindings: { BILLING_DEV: "true" },
            },
            () => enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        "an allowlist set only in Cloudflare bindings is read",
        withEnv(
            {
                flag: "billing",
                mode: "development",
                allowlist: undefined,
                bindings: { DEV_BILLING_DISCORD_IDS: OPERATOR },
            },
            () => enabled("billing", lib, OPERATOR)
        ) === true
    );

    check(
        "NODE_ENV set only in bindings still means production",
        withEnv(
            {
                flag: "billing",
                mode: undefined,
                allowlist: OPERATOR,
                bindings: { BILLING_DEV: "true", NODE_ENV: "production" },
            },
            () => enabled("billing", lib, OPERATOR)
        ) === false
    );

    check(
        "a production binding overrides a development process.env",
        withEnv(
            {
                flag: "billing",
                mode: "development",
                allowlist: OPERATOR,
                bindings: { NODE_ENV: "production" },
            },
            () => enabled("billing", lib, OPERATOR)
        ) === false
    );

    check(
        "a binding flag cannot rescue a production deployment",
        withEnv(
            {
                flag: "billing",
                value: null,
                mode: "production",
                allowlist: OPERATOR,
                bindings: { BILLING_DEV: "true" },
            },
            () => enabled("billing", lib, OPERATOR)
        ) === false
    );

    /* ---------------------------------------------------------------- */
    section("Both minting routes actually call the guard");

    /*
     * The guard is worthless if a route forgets it, so each route is checked
     * for the call and for the absence of any bypass.
     */
    const billingSource = readSource(BILLING_ROUTE);
    const crownsSource = readSource(CROWNS_ROUTE);

    check(
        "the billing route imports billingDevToolsEnabled",
        /billingDevToolsEnabled,?\s*\}?\s*from\s*"[^"]*devTools"/.test(billingSource)
    );

    check(
        "the billing route calls the guard with the session's discord id",
        /billingDevToolsEnabled\(\s*session\.discordId\s*\)/.test(billingSource)
    );

    check(
        "the billing route grants only after the guard",
        billingSource.indexOf("billingDevToolsEnabled(") <
            billingSource.indexOf("grantEntitlement(")
    );

    check(
        "the billing route revokes only after the guard",
        billingSource.indexOf("billingDevToolsEnabled(") <
            billingSource.indexOf("revokeEntitlement(")
    );

    check(
        "the crowns route imports crownDevToolsEnabled",
        /crownDevToolsEnabled,?\s*\}?\s*from\s*"[^"]*devTools"/.test(crownsSource)
    );

    check(
        "the crowns route calls the guard with the session's discord id",
        /crownDevToolsEnabled\(\s*session\.discordId\s*\)/.test(crownsSource)
    );

    check(
        "the crowns route credits only after the guard",
        crownsSource.indexOf("crownDevToolsEnabled(") <
            crownsSource.indexOf("creditCrowns(")
    );

    for (const [name, source] of [
        ["billing", billingSource],
        ["crowns", crownsSource],
    ]) {
        check(
            `the ${name} route verifies the session before deciding`,
            /verifySessionToken\(/.test(source)
        );

        check(
            `the ${name} route answers a denied guard with 404, not 200`,
            /status:\s*404/.test(source)
        );

        /*
         * A second, independent escape hatch — reading the flag directly
         * instead of through the guard — is how a guard gets bypassed during
         * a refactor that "just needs a quick check".
         */
        check(
            `the ${name} route does not read a dev flag itself`,
            !/process\.env\.(BILLING_DEV|CROWN_DEV|DEV_)/.test(source) &&
                !/cloudflare:workers/.test(source)
        );
    }

    /* ---------------------------------------------------------------- */
    section("The guard cannot mint value on its own");

    const libSource = readSource(LIB_PATH);

    check(
        "devTools.ts imports only cloudflare:workers",
        (libSource.match(/from\s+"([^"]+)"/g) || []).every((clause) =>
            clause.includes("cloudflare:workers")
        )
    );

    check(
        "the production default is written as a deny, not an opt-in",
        /mode\s*!==\s*"development"[\s\S]{0,120}mode\s*!==\s*"test"/.test(libSource)
    );

    console.log("");
    console.log(
        failed === 0
            ? `\x1b[32m${passed} passed, 0 failed\x1b[0m`
            : `\x1b[31m${passed} passed, ${failed} failed\x1b[0m`
    );

    process.exit(failed === 0 ? 0 : 1);
}

main();
