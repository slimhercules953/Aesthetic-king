#!/usr/bin/env node
/**
 * Verification for the payment layer: `studio/lib/payments/*`, the
 * checkout route and the Stripe webhook route.
 *
 * This is the code that turns a network request into paid access, so the
 * failure modes are the expensive ones:
 *
 *   1. Forgery. Anyone can POST to /api/webhooks/stripe. Only a body that
 *      carries a valid HMAC for the exact bytes may grant anything, and a
 *      signature must expire so a captured request cannot be replayed.
 *   2. Replay. Providers redeliver. One event must grant once, which is
 *      what the unique (provider, externalEventId) claim exists for.
 *   3. Browser-authored amounts. Nothing a client sends may choose a
 *      price, an amount, or the account that receives a grant.
 *
 * The signature tests compute real HMACs with Web Crypto rather than
 * stubbing the verifier, so a broken comparison fails here instead of in
 * production.
 *
 * Usage: node scripts/testPayments.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

const esbuild = require(path.join(ROOT, "studio", "node_modules", "esbuild"));

const PAYMENTS_DIR = path.join(ROOT, "studio", "lib", "payments");
const STRIPE_PATH = path.join(PAYMENTS_DIR, "stripe.ts");
const CATALOG_PATH = path.join(PAYMENTS_DIR, "catalog.ts");
const INDEX_PATH = path.join(PAYMENTS_DIR, "index.ts");
const APPLY_PATH = path.join(PAYMENTS_DIR, "applyPaymentEvent.ts");
const CHECKOUT_ROUTE = path.join(ROOT, "studio", "app", "api", "billing", "checkout", "route.ts");
const WEBHOOK_ROUTE = path.join(ROOT, "studio", "app", "api", "webhooks", "stripe", "route.ts");
const BILLING_PAGE = path.join(ROOT, "studio", "app", "dashboard", "premium", "billing", "page.tsx");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");

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
 * controlling every bare or relative specifier the module imports.
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

            throw new Error(`testPayments: cannot resolve "${specifier}" from ${target}`);
        };

        new Function("module", "exports", "require", result.code)(module, module.exports, req);
        cache.set(target, module.exports);

        return module.exports;
    }

    return load(modulePath);
}

/** Fake `../database` so the claim/apply SQL can be inspected. */
function fakeDb() {
    const calls = [];
    const handlers = [];

    return {
        calls,
        on(match, factory) {
            handlers.push({ match, factory });
        },
        /** Replaces the first handler for the same match. */
        set(match, factory) {
            const existing = handlers.find((handler) => handler.match === match);

            if (existing) {
                existing.factory = factory;
            } else {
                handlers.push({ match, factory });
            }
        },
        query: async (text, params = []) => {
            calls.push({ text, params });

            for (const handler of handlers) {
                if (text.includes(handler.match)) {
                    const out = handler.factory(params) ?? {};

                    return {
                        rows: out.rows ?? [],
                        rowCount: out.rowCount ?? (out.rows ?? []).length,
                    };
                }
            }

            return { rows: [], rowCount: 0 };
        },
    };
}

const SECRET = "whsec_test_secret_key_for_signature_checks_only";

async function sign(body, timestamp, secret = SECRET) {
    const signature = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");

    return `t=${timestamp},v1=${signature}`;
}

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function checkoutEvent(overrides = {}) {
    return {
        id: "evt_123",
        type: "checkout.session.completed",
        data: {
            object: {
                id: "cs_test_1",
                object: "checkout.session",
                payment_status: "paid",
                client_reference_id: "123456789012345678",
                subscription: "sub_1",
                metadata: {
                    discordId: "123456789012345678",
                    planId: "premium-monthly",
                },
                line_items: {
                    data: [{ price: { id: "price_monthly" } }],
                },
                ...overrides,
            },
        },
    };
}

async function main() {
    /* ---------------------------------------------------------------- */
    section("catalog — what is sellable");

    const savedEnv = { ...process.env };

    function resetEnv() {
        for (const key of Object.keys(process.env)) {
            if (/^(PREMIUM_|PAYMENT_PROVIDER|STRIPE_)/.test(key)) {
                delete process.env[key];
            }
        }
    }

    resetEnv();

    const catalog = loadModule(CATALOG_PATH);

    check(
        "an unconfigured deployment sells nothing",
        catalog.getSellablePlans().length === 0,
        `got ${catalog.getSellablePlans().length}`
    );

    process.env.PREMIUM_MONTHLY_PRICE_ID = "price_monthly";
    process.env.PREMIUM_ANNUAL_PRICE_ID = "price_annual";

    const partial = catalog.getSellablePlans();

    check(
        "only configured plans are offered",
        partial.length === 2 &&
            partial[0].id === "premium-monthly" &&
            partial[1].id === "premium-annual",
        partial.map((plan) => plan.id).join(",")
    );

    check(
        "a subscription has no app-owned duration",
        partial[0].durationMonths === null
    );

    check(
        "a one-time plan carries its duration",
        partial[1].durationMonths === 12
    );

    check(
        "the provider price id never comes from the browser",
        partial.every((plan) => plan.providerPriceId.startsWith("price_"))
    );

    process.env.PREMIUM_ANNUAL_DISPLAY_PRICE = "$34.99 once";

    check(
        "display price is overridable for cosmetic changes",
        catalog.findSellablePlan("premium-annual").displayPrice === "$34.99 once"
    );

    check(
        "an unknown plan id resolves to nothing",
        catalog.findSellablePlan("premium-free-forever") === null
    );

    check(
        "a configured-but-not-deployed plan cannot be bought",
        catalog.findSellablePlan("premium-quarter") === null
    );

    check(
        "a blank plan id is rejected",
        catalog.findSellablePlan("   ") === null && catalog.findSellablePlan(null) === null
    );

    check(
        "a snowflake-shaped id is accepted",
        catalog.isDiscordId("123456789012345678") === true
    );

    check(
        "anything else is rejected as a Discord id",
        ["", "  ", "12345", "123456789012345678901", "abc456789012345678", "1234567890123456",
            null, undefined, 12345678, { id: "123456789012345678" }].every(
            (value) => catalog.isDiscordId(value) === false
        )
    );

    const base = new Date("2026-01-31T12:00:00Z");

    check(
        "adding a month from Jan 31 lands in February, not March",
        catalog.addMonths(base, 1).toISOString() === "2026-02-28T12:00:00.000Z",
        catalog.addMonths(base, 1).toISOString()
    );

    check(
        "adding twelve months keeps the day and the year honest",
        catalog.addMonths(new Date("2026-02-28T00:00:00Z"), 12).toISOString() ===
            "2027-02-28T00:00:00.000Z"
    );

    /* ---------------------------------------------------------------- */
    section("stripe — webhook signature verification");

    const stripe = loadModule(STRIPE_PATH, {
        "../auth": {
            constantTimeEquals: (a, b) => {
                const left = Buffer.from(String(a));
                const right = Buffer.from(String(b));

                return left.length === right.length && crypto.timingSafeEqual(left, right);
            },
        },
    });

    process.env.STRIPE_WEBHOOK_SECRET = SECRET;

    const body = JSON.stringify(checkoutEvent());
    const provider = stripe.stripeProvider;

    const valid = await provider.verifyWebhook({
        body,
        signatureHeader: await sign(body, nowSeconds()),
    });

    check("a correctly signed body is accepted", Array.isArray(valid) && valid.length === 1);
    check(
        "the decoded event carries the account we wrote into the session",
        valid[0].discordId === "123456789012345678"
    );
    check("the plan id survives the round trip", valid[0].planId === "premium-monthly");
    check("the price id becomes the sku", valid[0].skuId === "price_monthly");
    check(
        "the subscription id becomes the external entitlement id",
        valid[0].externalEntitlementId === "sub_1"
    );
    check("the kind is our vocabulary, not Stripe's", valid[0].kind === "checkout_completed");

    const tamperedBody = JSON.stringify(
        checkoutEvent({ client_reference_id: "999999999999999999" })
    );

    check(
        "a body edited after signing is rejected",
        (await provider.verifyWebhook({
            body: tamperedBody,
            signatureHeader: await sign(body, nowSeconds()),
        })) === null
    );

    check(
        "a signature from a different secret is rejected",
        (await provider.verifyWebhook({
            body,
            signatureHeader: await sign(body, nowSeconds(), "whsec_some_other_secret"),
        })) === null
    );

    check(
        "a missing signature header is rejected",
        (await provider.verifyWebhook({ body, signatureHeader: null })) === null
    );

    check(
        "a header with no timestamp is rejected",
        (await provider.verifyWebhook({
            body,
            signatureHeader: `v1=${"0".repeat(64)}`,
        })) === null
    );

    check(
        "a header with no v1 signature is rejected",
        (await provider.verifyWebhook({
            body,
            signatureHeader: `t=${nowSeconds()}`,
        })) === null
    );

    check(
        "a signature older than the tolerance is rejected",
        (await provider.verifyWebhook({
            body,
            signatureHeader: await sign(body, nowSeconds() - 3600),
        })) === null,
        "a captured request must not be replayable forever"
    );

    check(
        "a timestamp far in the future is rejected",
        (await provider.verifyWebhook({
            body,
            signatureHeader: await sign(body, nowSeconds() + 3600),
        })) === null
    );

    check(
        "a freshly signed request inside the tolerance is accepted",
        (await provider.verifyWebhook({
            body,
            signatureHeader: await sign(body, nowSeconds() - 120),
        })) !== null
    );

    const rotated = `t=${nowSeconds()},v1=${"0".repeat(64)},v1=${(
        await crypto.createHmac("sha256", SECRET).update(`${nowSeconds()}.${body}`).digest("hex")
    )}`;

    check(
        "a signature matching either secret during rotation is accepted",
        (await provider.verifyWebhook({ body, signatureHeader: rotated })) !== null
    );

    check(
        "a non-numeric timestamp is rejected",
        (await provider.verifyWebhook({
            body,
            signatureHeader: "t=abc,v1=" + "0".repeat(64),
        })) === null
    );

    check(
        "a signed body that is not JSON is rejected rather than crashing",
        (await provider.verifyWebhook({
            body: "not json at all",
            signatureHeader: await sign("not json at all", nowSeconds()),
        })) === null
    );

    const noSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    check(
        "an unconfigured webhook secret rejects everything instead of trusting the body",
        (await provider.verifyWebhook({
            body,
            signatureHeader: await sign(body, nowSeconds(), noSecret),
        })) === null
    );

    process.env.STRIPE_WEBHOOK_SECRET = noSecret;

    /* ---------------------------------------------------------------- */
    section("stripe — event mapping");

    const testing = stripe.__testing;

    function map(event) {
        return testing.toPaymentEvents(event);
    }

    check(
        "an unpaid checkout grants nothing",
        map({
            ...checkoutEvent(),
            data: { object: { ...checkoutEvent().data.object, payment_status: "unpaid" } },
        }).length === 0,
        "a session Stripe never collected for must not become free Premium"
    );

    check(
        "a first subscription invoice is not counted as a renewal",
        map({
            id: "evt_inv",
            type: "invoice.paid",
            data: {
                object: {
                    billing_reason: "subscription_create",
                    subscription: "sub_1",
                    period_end: nowSeconds(),
                },
            },
        }).length === 0
    );

    const renewal = map({
        id: "evt_inv2",
        type: "invoice.paid",
        data: {
            object: {
                billing_reason: "subscription_cycle",
                subscription: "sub_1",
                client_reference_id: "123456789012345678",
                metadata: { planId: "premium-monthly" },
                period_end: 1893456000,
                lines: { data: [{ price: { id: "price_monthly" } }] },
            },
        },
    });

    check("a genuine renewal extends the entitlement", renewal.length === 1 &&
        renewal[0].kind === "subscription_renewed");
    check(
        "the renewal uses the provider's own period end",
        renewal[0].currentPeriodEnd?.getTime() === 1893456000000
    );

    const cancelled = map({
        id: "evt_del",
        type: "customer.subscription.deleted",
        data: {
            object: {
                id: "sub_1",
                ended_at: 1893456000,
                metadata: { discordId: "123456789012345678" },
            },
        },
    });

    check(
        "a cancelled subscription revokes by external id",
        cancelled.length === 1 &&
            cancelled[0].kind === "subscription_canceled" &&
            cancelled[0].externalEntitlementId === "sub_1"
    );

    const refunded = map({
        id: "evt_ref",
        type: "charge.refunded",
        data: {
            object: {
                id: "ch_1",
                metadata: { discordId: "123456789012345678", planId: "premium-annual" },
            },
        },
    });

    check(
        "a refund ends the entitlement it bought",
        refunded.length === 1 && refunded[0].kind === "refund_issued"
    );

    check(
        "an unrelated event type produces no action",
        map({ id: "evt_x", type: "customer.created", data: { object: {} } }).length === 0
    );

    check(
        "an event without an id is dropped, not applied anonymously",
        map({ type: "checkout.session.completed", data: { object: {} } }).length === 0
    );

    check(
        "a payload with no data object cannot crash the mapper",
        (() => {
            const events = map({ id: "evt_y", type: "checkout.session.completed" });

            /*
             * A stripped-down payload may still decode, but it must not
             * name an account — otherwise it could grant something. Being
             * ignored later for having no Discord id is the safe outcome.
             */
            return (
                events.every((event) => event.discordId === null) &&
                map(null).length === 0 &&
                map("nonsense").length === 0
            );
        })()
    );

    /* ---------------------------------------------------------------- */
    section("applyPaymentEvent — replay protection and grants");

    const grantCalls = [];
    const revokeCalls = [];
    const notifyCalls = [];

    function loadApply(db) {
        return loadModule(APPLY_PATH, {
            "../database": db,
            "../entitlements": {
                grantEntitlement: async (discordId, input) => {
                    grantCalls.push({ discordId, input });

                    return { id: "ent-1", type: input.type, source: input.source };
                },
                revokeEntitlementByExternalId: async (externalId) => {
                    revokeCalls.push(externalId);

                    return 1;
                },
            },
            "../notifications": {
                createNotificationForDiscordUser: async (discordId, input) => {
                    notifyCalls.push({ discordId, input });

                    return true;
                },
            },
        });
    }

    resetEnv();
    process.env.PREMIUM_MONTHLY_PRICE_ID = "price_monthly";
    process.env.PREMIUM_ANNUAL_PRICE_ID = "price_annual";

    const db = fakeDb();
    db.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "row-1" }], rowCount: 1 }));

    const apply = loadApply(db);

    const grantOutcome = await apply.applyPaymentEvent("stripe", {
        id: "evt_1",
        kind: "checkout_completed",
        discordId: "123456789012345678",
        planId: "premium-monthly",
        skuId: "price_monthly",
        externalEntitlementId: "sub_1",
        currentPeriodEnd: new Date("2026-03-01T00:00:00Z"),
        raw: { id: "evt_1" },
    });

    const claim = db.calls[0];

    check("a first delivery is applied", grantOutcome.status === "applied", grantOutcome.status);

    check(
        "the claim is an INSERT ... ON CONFLICT DO NOTHING",
        /INSERT INTO "PaymentEventRecord"/.test(claim.text) &&
            /ON CONFLICT \("provider", "externalEventId"\) DO NOTHING/.test(claim.text)
    );

    check(
        "the raw payload is stored bound, not interpolated",
        claim.params[4] === JSON.stringify({ id: "evt_1" }) &&
            !claim.text.includes('"evt_1"')
    );

    check(
        "the grant is attributed to the session's account, not a form field",
        grantCalls[0].discordId === "123456789012345678"
    );

    check(
        "the entitlement records the provider as its source",
        grantCalls[0].input.source === "stripe"
    );

    check(
        "the provider's period end is authoritative for a subscription",
        grantCalls[0].input.endsAt.toISOString() === "2026-03-01T00:00:00.000Z"
    );

    check(
        "the external id is stored so a later refund can find it",
        grantCalls[0].input.externalEntitlementId === "sub_1"
    );

    db.calls.length = 0;
    db.set("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [], rowCount: 0 }));

    const replay = await apply.applyPaymentEvent("stripe", {
        id: "evt_1",
        kind: "checkout_completed",
        discordId: "123456789012345678",
        planId: "premium-monthly",
        skuId: "price_monthly",
        externalEntitlementId: "sub_1",
        currentPeriodEnd: null,
        raw: {},
    });

    check(
        "a redelivered event grants nothing",
        replay.status === "duplicate" && grantCalls.length === 1,
        `${replay.status} / ${grantCalls.length} grants`
    );

    db.calls.length = 0;
    grantCalls.length = 0;

    const oneTime = await (async () => {
        const db2 = fakeDb();
        db2.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db2).applyPaymentEvent("stripe", {
            id: "evt_2",
            kind: "checkout_completed",
            discordId: "123456789012345678",
            planId: "premium-annual",
            skuId: "price_annual",
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "a one-time purchase gets its window from the catalog",
        oneTime.status === "applied" &&
            grantCalls[0].input.endsAt.getTime() - Date.now() >
                360 * 24 * 60 * 60 * 1000
    );

    const badAccount = await (async () => {
        const db3 = fakeDb();
        db3.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db3).applyPaymentEvent("stripe", {
            id: "evt_3",
            kind: "checkout_completed",
            discordId: "not-a-snowflake",
            planId: "premium-monthly",
            skuId: null,
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "an event naming a malformed account is ignored, never guessed",
        badAccount.status === "ignored" && badAccount.reason === "no_valid_discord_id"
    );

    const badPlan = await (async () => {
        const db4 = fakeDb();
        db4.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db4).applyPaymentEvent("stripe", {
            id: "evt_4",
            kind: "checkout_completed",
            discordId: "123456789012345678",
            planId: "premium-for-life",
            skuId: null,
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "a plan id outside our catalog grants nothing",
        badPlan.status === "ignored" && badPlan.reason.startsWith("unknown_plan")
    );

    revokeCalls.length = 0;
    notifyCalls.length = 0;

    const refundOutcome = await (async () => {
        const db5 = fakeDb();
        db5.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db5).applyPaymentEvent("stripe", {
            id: "evt_5",
            kind: "refund_issued",
            discordId: "123456789012345678",
            planId: "premium-annual",
            skuId: null,
            externalEntitlementId: "ch_1",
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "a refund revokes by the provider's id",
        refundOutcome.status === "applied" && revokeCalls[0] === "ch_1"
    );

    check(
        "the customer is told when a refund ends their Premium",
        notifyCalls.length === 1 &&
            notifyCalls[0].input.type === "PREMIUM_REVOKED" &&
            notifyCalls[0].discordId === "123456789012345678"
    );

    const noExternal = await (async () => {
        const db6 = fakeDb();
        db6.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db6).applyPaymentEvent("stripe", {
            id: "evt_6",
            kind: "refund_issued",
            discordId: "123456789012345678",
            planId: null,
            skuId: null,
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "a refund naming nothing revokes nothing",
        noExternal.status === "ignored" &&
            noExternal.reason === "no_external_entitlement_id"
    );

    const claimFailed = await (async () => {
        const db7 = {
            query: async () => {
                throw new Error("connection terminated");
            },
        };

        return loadApply(db7).applyPaymentEvent("stripe", {
            id: "evt_7",
            kind: "checkout_completed",
            discordId: "123456789012345678",
            planId: "premium-monthly",
            skuId: null,
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "if the claim cannot be written, nothing is granted",
        claimFailed.status === "failed" && claimFailed.reason === "claim_write_failed",
        "double-granting is worse than a retry"
    );

    const applyFailed = await (async () => {
        const db8 = fakeDb();
        db8.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadModule(APPLY_PATH, {
            "../database": db8,
            "../entitlements": {
                grantEntitlement: async () => {
                    throw new Error("deadlock detected");
                },
                revokeEntitlementByExternalId: async () => 0,
            },
            "../notifications": {
                createNotificationForDiscordUser: async () => true,
            },
        }).applyPaymentEvent("stripe", {
            id: "evt_8",
            kind: "checkout_completed",
            discordId: "123456789012345678",
            planId: "premium-monthly",
            skuId: null,
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "a failed grant releases its claim so the provider can retry",
        applyFailed.status === "failed" && applyFailed.reason === "deadlock detected"
    );

    const db9 = fakeDb();
    db9.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

    await loadModule(APPLY_PATH, {
        "../database": db9,
        "../entitlements": {
            grantEntitlement: async () => {
                throw new Error("boom");
            },
            revokeEntitlementByExternalId: async () => 0,
        },
        "../notifications": {
            createNotificationForDiscordUser: async () => true,
        },
    }).applyPaymentEvent("stripe", {
        id: "evt_9",
        kind: "checkout_completed",
        discordId: "123456789012345678",
        planId: "premium-monthly",
        skuId: null,
        externalEntitlementId: null,
        currentPeriodEnd: null,
        raw: {},
    });

    check(
        "the released claim is a DELETE of exactly that event",
        db9.calls.some(
            (call) =>
                /DELETE FROM "PaymentEventRecord"/.test(call.text) &&
                call.params[0] === "stripe" &&
                call.params[1] === "evt_9"
        )
    );

    const batch = await (async () => {
        const db10 = fakeDb();
        db10.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db10).applyPaymentEvents("stripe", [
            {
                id: "evt_a",
                kind: "checkout_completed",
                discordId: "123456789012345678",
                planId: "premium-monthly",
                skuId: null,
                externalEntitlementId: "sub_a",
                currentPeriodEnd: null,
                raw: {},
            },
            {
                id: "evt_b",
                kind: "refund_issued",
                discordId: "123456789012345678",
                planId: null,
                skuId: null,
                externalEntitlementId: "ch_b",
                currentPeriodEnd: null,
                raw: {},
            },
        ]);
    })();

    check(
        "a batch reports every outcome, not just the first",
        batch.length === 2 && batch.every((outcome) => outcome.status === "applied")
    );

    /* ---------------------------------------------------------------- */
    section("provider selection");

    resetEnv();

    const index = loadModule(INDEX_PATH, {});

    check(
        "no provider means no checkout, without throwing",
        index.getPaymentProvider() === null &&
            index.isPaymentProviderConfigured() === false
    );

    process.env.STRIPE_SECRET_KEY = "sk_test_abc";

    check(
        "a secret key alone is not enough to promise a store",
        index.isPaymentProviderConfigured() === false,
        "a button that always fails is worse than no button"
    );

    process.env.PREMIUM_MONTHLY_PRICE_ID = "price_monthly";

    check(
        "a key plus a configured price enables checkout",
        index.getPaymentProvider()?.name === "stripe"
    );

    process.env.STRIPE_SECRET_KEY = "pk_live_not_a_secret";

    check(
        "a publishable key is not mistaken for a secret key",
        index.getPaymentProvider() === null
    );

    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    process.env.PAYMENT_PROVIDER = "paypal";

    check(
        "an unknown provider name disables checkout",
        index.getPaymentProvider() === null
    );

    process.env.PAYMENT_PROVIDER = "  Stripe  ";

    check(
        "the provider selector is case and whitespace tolerant",
        index.getPaymentProvider()?.name === "stripe"
    );

    /* ---------------------------------------------------------------- */
    section("routes — source contracts");

    const checkoutSource = readSource(CHECKOUT_ROUTE);
    const webhookSource = readSource(WEBHOOK_ROUTE);
    const pageSource = readSource(BILLING_PAGE);

    check(
        "checkout requires a verified session",
        /verifySessionToken\(/.test(checkoutSource) &&
            /SESSION_COOKIE_NAME/.test(checkoutSource)
    );

    check(
        "checkout grants the account from the session only",
        /discordId:\s*session\.discordId/.test(checkoutSource) &&
            !/discordId:\s*formData/.test(checkoutSource)
    );

    check(
        "checkout resolves the plan through the catalog",
        /findSellablePlan\(/.test(checkoutSource) &&
            !/price|amount|currency/i.test(
                (checkoutSource.match(/formData\?\.get\("[^"]+"\)/g) || []).join(" ")
            )
    );

    check(
        "checkout refuses an unconfigured provider",
        /getPaymentProvider\(\)/.test(checkoutSource) &&
            /status:\s*404/.test(checkoutSource)
    );

    check(
        "checkout never decides anyone got Premium",
        !/grantEntitlement/.test(checkoutSource)
    );

    check(
        "the webhook reads the body as raw text before parsing",
        webhookSource.indexOf("await request.text()") <
            webhookSource.indexOf("verifyWebhook") &&
        !/JSON\.parse\(await request/.test(webhookSource)
    );

    check(
        "the webhook verifies before applying",
        webhookSource.indexOf("provider.verifyWebhook(") <
            webhookSource.indexOf("await applyPaymentEvents(")
    );

    check(
        "an invalid signature is rejected with 401",
        /status:\s*401/.test(webhookSource)
    );

    check(
        "an unconfigured webhook answers 404 rather than 500",
        /status:\s*404/.test(webhookSource) &&
            /STRIPE_WEBHOOK_SECRET/.test(webhookSource)
    );

    check(
        "a database failure is the only thing that asks for a retry",
        /status:\s*500/.test(webhookSource) &&
            /catch \(error\)[\s\S]*status:\s*500/.test(webhookSource)
    );

    check(
        "the webhook grants nothing itself",
        !/grantEntitlement|revokeEntitlement/.test(webhookSource)
    );

    check(
        "the billing page offers plans only when checkout exists",
        /getSellablePlans\(\)/.test(pageSource) &&
            /getPaymentProvider\(\)/.test(pageSource) &&
            /checkoutAvailable && plans\.length > 0/.test(pageSource)
    );

    check(
        "the billing page still says so when checkout is unavailable",
        /Checkout is not available yet/.test(pageSource)
    );

    check(
        "the checkout form sends only a plan id",
        /action="\/api\/billing\/checkout"/.test(pageSource) &&
            /name="plan"/.test(pageSource) &&
            !/name="(amount|price|currency|discordId)"/.test(pageSource)
    );

    check(
        "the checkout form posts rather than GETs",
        /method="post"/.test(
            pageSource.slice(
                pageSource.indexOf('action="/api/billing/checkout"') - 200,
                pageSource.indexOf('action="/api/billing/checkout"') + 200
            )
        )
    );

    /* ---------------------------------------------------------------- */
    section("schema and migration");

    const schema = readSource(SCHEMA_PATH);

    check(
        "PaymentEventRecord exists with a provider-scoped unique id",
        /model PaymentEventRecord \{[\s\S]*?@@unique\(\[provider, externalEventId\]/.test(schema) &&
            /@@index\(\[discordId, processedAt\]\)/.test(schema)
    );

    const migrationFile = path.join(
        ROOT,
        "prisma",
        "migrations",
        "20261006140000_add_payment_event_records",
        "migration.sql"
    );

    check(
        "a migration creates the table",
        fs.existsSync(migrationFile) &&
            /CREATE TABLE "PaymentEventRecord"/.test(readSource(migrationFile))
    );

    check(
        "the migration creates the unique index the claim relies on",
        fs.existsSync(migrationFile) &&
            /CREATE UNIQUE INDEX "PaymentEventRecord_provider_externalEventId_key"/.test(
                readSource(migrationFile)
            )
    );

    /* ---------------------------------------------------------------- */
    section("the app never touches card data");

    const paymentsSources = [
        STRIPE_PATH,
        CATALOG_PATH,
        INDEX_PATH,
        APPLY_PATH,
        CHECKOUT_ROUTE,
        WEBHOOK_ROUTE,
    ]
        .map(readSource)
        .join("\n");

    check(
        "no card fields anywhere in the payment layer",
        !/card_number|cardNumber|cvv|cvc|exp_month|pan\b/i.test(paymentsSources),
        "collecting card data would put the app in PCI scope"
    );

    check(
        "checkout is always a redirect to a hosted page",
        /NextResponse\.redirect\(checkout\.url/.test(checkoutSource)
    );

    check(
        "the charged amount is never computed in this app",
        !/line_items\[0\]\[price_data\]/.test(paymentsSources),
        "inline price_data would let our code choose the amount"
    );

    /* ---------------------------------------------------------------- */
    for (const key of Object.keys(process.env)) {
        if (/^(PREMIUM_|PAYMENT_PROVIDER|STRIPE_)/.test(key)) {
            delete process.env[key];
        }
    }

    Object.assign(process.env, savedEnv);

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
