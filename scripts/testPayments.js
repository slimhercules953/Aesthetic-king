#!/usr/bin/env node
/**
 * Verification for the payment layer: `studio/lib/payments/*`, the
 * checkout route, the customer-portal route and the Stripe webhook
 * route.
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
const PORTAL_ROUTE = path.join(ROOT, "studio", "app", "api", "billing", "portal", "route.ts");
const WEBHOOK_ROUTE = path.join(ROOT, "studio", "app", "api", "webhooks", "stripe", "route.ts");
const BILLING_PAGE = path.join(ROOT, "studio", "app", "dashboard", "premium", "billing", "page.tsx");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");
const ENTITLEMENTS_PATH = path.join(ROOT, "studio", "lib", "entitlements.ts");
const GRANDFATHER_PATH = path.join(ROOT, "studio", "lib", "grandfather.ts");

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

/*
 * What Stripe returns for `GET /v1/subscriptions/{id}`.
 *
 * The mapper fetches the subscription behind a completed checkout because
 * the Checkout Session itself carries no billing period — without this the
 * grant would have no end date, so the fixture has to be as real as the
 * payload it replaces.
 */
function subscriptionJson(overrides = {}) {
    return {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        metadata: {
            discordId: "123456789012345678",
            planId: "premium-monthly",
        },
        items: {
            data: [
                {
                    id: "si_1",
                    current_period_end: 1893456000,
                    price: { id: "price_monthly" },
                },
            ],
        },
        ...overrides,
    };
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
        "the yearly plan is a subscription too, not a one-off charge",
        partial[1].durationMonths === null,
        "its Stripe price recurs, so checkout must use subscription mode"
    );

    check(
        "the browser-facing checkout keys are the short ones",
        partial[0].checkoutKey === "monthly" && partial[1].checkoutKey === "yearly",
        partial.map((plan) => plan.checkoutKey).join(",")
    );

    check(
        "a checkout key resolves to the plan that holds the real price id",
        catalog.findPlanByCheckoutKey("monthly")?.id === "premium-monthly" &&
            catalog.findPlanByCheckoutKey("yearly")?.id === "premium-annual"
    );

    check(
        "a checkout key is matched loosely but never invented",
        catalog.findPlanByCheckoutKey("  MONTHLY  ")?.id === "premium-monthly" &&
            catalog.findPlanByCheckoutKey("weekly") === null &&
            catalog.findPlanByCheckoutKey("premium-monthly") === null &&
            catalog.findPlanByCheckoutKey("") === null &&
            catalog.findPlanByCheckoutKey(null) === null,
        "a stored plan id must not be accepted from a form"
    );

    check(
        "a plan with no configured price has no checkout key either",
        catalog.findPlanByCheckoutKey("quarterly") === null &&
            catalog.findPlanByCheckoutKey("premium-quarter") === null
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

    /*
     * `../database` is stubbed because the customer lookup reads the
     * stored id from Postgres. These handlers let the customer tests say
     * exactly what the database holds without a real connection.
     */
    const stripeDb = fakeDb();

    const stripeFetch = {
        calls: [],
        queued: [],
        queue(...handlers) {
            this.queued.push(...handlers);
        },
        reset() {
            this.calls.length = 0;
            this.queued.length = 0;
        },
    };

    const realFetch = globalThis.fetch;

    globalThis.fetch = async (url, init = {}) => {
        const call = { url: String(url), init, form: new URLSearchParams(String(init.body ?? "")) };

        stripeFetch.calls.push(call);

        const handler = stripeFetch.queued.shift();

        if (!handler) {
            throw new Error(`testPayments: unexpected fetch ${call.url}`);
        }

        return {
            ok: handler.ok ?? true,
            status: handler.status ?? (handler.ok === false ? 400 : 200),
            json: async () => handler.json ?? {},
        };
    };

    const stripe = loadModule(STRIPE_PATH, {
        "../auth": {
            constantTimeEquals: (a, b) => {
                const left = Buffer.from(String(a));
                const right = Buffer.from(String(b));

                return left.length === right.length && crypto.timingSafeEqual(left, right);
            },
        },
        "../database": stripeDb,
    });

    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_mapping_probe";

    /*
     * A paid checkout makes the mapper read the subscription back from
     * Stripe, so every signature test below that reaches the mapper needs
     * that answer queued. Queuing it here rather than per-assertion keeps
     * the signature checks about signatures.
     */
    function queueSubscription(json = subscriptionJson()) {
        stripeFetch.queue({ json });
    }

    const body = JSON.stringify(checkoutEvent());
    const provider = stripe.stripeProvider;

    queueSubscription();

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
        "the paid window comes from the subscription, not the session",
        valid[0].currentPeriodEnd?.getTime() === 1893456000000 &&
            stripeFetch.calls.some((call) => /\/v1\/subscriptions\/sub_1$/.test(call.url)),
        "the Checkout Session has no billing period of its own"
    );

    queueSubscription();

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

    queueSubscription();

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

    async function map(event, handlers = []) {
        stripeFetch.queue(...handlers);

        return testing.toPaymentEvents(event);
    }

    check(
        "an unpaid checkout grants nothing",
        (
            await map({
                ...checkoutEvent(),
                data: { object: { ...checkoutEvent().data.object, payment_status: "unpaid" } },
            })
        ).length === 0,
        "a session Stripe never collected for must not become free Premium"
    );

    check(
        "a first subscription invoice is not counted as a renewal",
        (
            await map({
                id: "evt_inv",
                type: "invoice.paid",
                data: {
                    object: {
                        billing_reason: "subscription_create",
                        subscription: "sub_1",
                        period_end: nowSeconds(),
                    },
                },
            })
        ).length === 0
    );

    /*
     * The shape this API version actually delivers: no `subscription` key
     * on the invoice, identity in the parent's metadata, the price as a
     * bare id on the line, and a `period_end` that is the invoice date
     * rather than the end of the paid period.
     */
    const renewal = (
        await map({
            id: "evt_inv2",
            type: "invoice.paid",
            data: {
                object: {
                    id: "in_2",
                    billing_reason: "subscription_cycle",
                    customer: "cus_1",
                    period_start: 1861833600,
                    period_end: 1861833600,
                    parent: {
                        subscription_details: {
                            subscription: "sub_1",
                            metadata: {
                                discordId: "123456789012345678",
                                planId: "premium-monthly",
                            },
                        },
                    },
                    lines: {
                        data: [
                            {
                                pricing: { price_details: { price: "price_monthly" } },
                                period: { start: 1861833600, end: 1893456000 },
                            },
                        ],
                    },
                },
            },
        })
    );

    check(
        "a genuine renewal extends the entitlement",
        renewal.length === 1 && renewal[0].kind === "subscription_renewed"
    );
    check(
        "the renewal is attributed through the invoice's subscription metadata",
        renewal[0].discordId === "123456789012345678" &&
            renewal[0].planId === "premium-monthly" &&
            renewal[0].externalEntitlementId === "sub_1"
    );
    check(
        "the renewal uses the billed line's period end, not the invoice date",
        renewal[0].currentPeriodEnd?.getTime() === 1893456000000,
        String(renewal[0].currentPeriodEnd)
    );
    check("the renewal records the price it was billed at", renewal[0].skuId === "price_monthly");

    const cancelled = await map({
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

    /*
     * A refund carries a customer and a payment intent and nothing else,
     * so the mapper has to walk charge → intent → invoice → subscription.
     * These handlers are that chain.
     */
    const refunded = await map(
        {
            id: "evt_ref",
            type: "charge.refunded",
            data: {
                object: {
                    id: "ch_1",
                    customer: "cus_1",
                    payment_intent: "pi_1",
                    metadata: {},
                },
            },
        },
        [
            { json: { id: "pi_1", payment_details: { order_reference: "in_1" } } },
            {
                json: {
                    id: "in_1",
                    parent: {
                        subscription_details: {
                            subscription: "sub_9",
                            metadata: {
                                discordId: "123456789012345678",
                                planId: "premium-annual",
                            },
                        },
                    },
                },
            },
        ]
    );

    check(
        "a refund ends the entitlement it bought",
        refunded.length === 1 && refunded[0].kind === "refund_issued"
    );
    check(
        "a refund revokes the subscription id the entitlement was stored under",
        refunded[0].externalEntitlementId === "sub_9" &&
            refunded[0].discordId === "123456789012345678" &&
            refunded[0].planId === "premium-annual",
        JSON.stringify(refunded[0].externalEntitlementId)
    );

    /*
     * When the chain is broken — a one-off purchase with no invoice — the
     * only handle left is the customer, and that is usable only if it names
     * exactly one subscription.
     */
    const orphanRefund = await map(
        {
            id: "evt_ref2",
            type: "charge.refunded",
            data: { object: { id: "ch_2", customer: "cus_2", payment_intent: "pi_2" } },
        },
        [
            { json: { id: "pi_2", payment_details: {} } },
            { json: { data: [subscriptionJson({ id: "sub_5" })] } },
        ]
    );

    check(
        "a refund with no invoice still resolves through an unambiguous customer",
        orphanRefund.length === 1 &&
            orphanRefund[0].externalEntitlementId === "sub_5" &&
            orphanRefund[0].discordId === "123456789012345678"
    );

    const ambiguousRefund = await map(
        {
            id: "evt_ref3",
            type: "charge.refunded",
            data: { object: { id: "ch_3", customer: "cus_3", payment_intent: "pi_3" } },
        },
        [
            { json: { id: "pi_3", payment_details: {} } },
            {
                json: {
                    data: [
                        subscriptionJson({ id: "sub_a" }),
                        subscriptionJson({ id: "sub_b" }),
                    ],
                },
            },
        ]
    );

    check(
        "a refund whose customer holds several subscriptions revokes nothing",
        ambiguousRefund.length === 1 &&
            ambiguousRefund[0].externalEntitlementId === null &&
            ambiguousRefund[0].discordId === null,
        "guessing which subscription to revoke is worse than revoking none"
    );

    check(
        "an unrelated event type produces no action",
        (await map({ id: "evt_x", type: "customer.created", data: { object: {} } })).length === 0
    );

    check(
        "an event without an id is dropped, not applied anonymously",
        (await map({ type: "checkout.session.completed", data: { object: {} } })).length === 0
    );

    /*
     * A lookup that fails must not turn into a 500. Stripe retries a
     * failing webhook forever, and a payment already recorded must not be
     * re-applied on every retry.
     */
    const degraded = await map(checkoutEvent(), [{ ok: false, status: 502 }]);

    check(
        "a failed subscription lookup degrades instead of throwing",
        degraded.length === 1 &&
            degraded[0].currentPeriodEnd === null &&
            degraded[0].skuId === "price_monthly"
    );

    check(
        "a payload with no data object cannot crash the mapper",
        await (async () => {
            const events = await map({
                id: "evt_y",
                type: "checkout.session.completed",
            });

            /*
             * A stripped-down payload may still decode, but it must not
             * name an account — otherwise it could grant something. Being
             * ignored later for having no Discord id is the safe outcome.
             */
            return (
                events.every((event) => event.discordId === null) &&
                (await map(null)).length === 0 &&
                (await map("nonsense")).length === 0
            );
        })()
    );

    /* ---------------------------------------------------------------- */
    section("stripe — one customer per account");

    const CUSTOMER_ID = "cus_1234567890";
    const SNOWFLAKE = "123456789012345678";

    process.env.STRIPE_SECRET_KEY = "sk_test_checkout_probe";

    function storedCustomer(value) {
        stripeDb.set("SELECT \"stripeCustomerId\"", () => ({
            rows: value === null ? [] : [{ stripeCustomerId: value }],
        }));
    }

    /** Clears the recorded SQL and fetch calls so each case stands alone. */
    function resetProbe(value) {
        stripeFetch.reset();
        stripeDb.calls.length = 0;
        storedCustomer(value);
    }

    /* --- a first-time buyer gets a customer, and it is remembered --- */

    resetProbe(null);
    stripeDb.set('UPDATE "User"', () => ({ rowCount: 1 }));
    stripeFetch.queue({ json: { id: "cus_brand_new" } });

    check(
        "an account with no stored customer gets one created",
        (await stripe.ensureStripeCustomer({ discordId: SNOWFLAKE })) === "cus_brand_new"
    );

    check(
        "the created customer is the one Stripe returned",
        stripeFetch.calls.length === 1 &&
            stripeFetch.calls[0].url === "https://api.stripe.com/v1/customers" &&
            stripeFetch.calls[0].init.method === "POST" &&
            stripeFetch.calls[0].form.get("metadata[discordId]") === SNOWFLAKE,
        stripeFetch.calls.map((call) => call.url).join(" ")
    );

    const customerUpdate = stripeDb.calls.find((call) => call.text.includes('UPDATE "User"'));

    check(
        "the new customer id is written back to the account",
        !!customerUpdate &&
            customerUpdate.params[0] === SNOWFLAKE &&
            customerUpdate.params[1] === "cus_brand_new" &&
            /"stripeCustomerId" IS NULL/.test(customerUpdate.text),
        "the IS NULL guard is what stops two concurrent checkouts fighting"
    );

    /* --- a returning buyer is looked up, never re-created --- */

    resetProbe(CUSTOMER_ID);
    stripeFetch.queue({ json: { id: CUSTOMER_ID } });

    check(
        "a stored customer is reused",
        (await stripe.ensureStripeCustomer({ discordId: SNOWFLAKE })) === CUSTOMER_ID
    );

    check(
        "reuse means one read of the customer and no writes at all",
        stripeFetch.calls.length === 1 &&
            stripeFetch.calls[0].url === `https://api.stripe.com/v1/customers/${CUSTOMER_ID}` &&
            (stripeFetch.calls[0].init.method ?? "GET") === "GET" &&
            !stripeDb.calls.some((call) => call.text.includes('UPDATE "User"')),
        stripeFetch.calls.map((call) => call.url).join(" ")
    );

    /* --- a stale id is replaced rather than sent to Stripe --- */

    resetProbe("cus_deleted_in_dashboard");
    stripeFetch.queue({ ok: false, status: 404, json: { error: { message: "No such customer" } } }, { json: { id: "cus_replacement" } });

    check(
        "a customer Stripe no longer has is replaced",
        (await stripe.ensureStripeCustomer({ discordId: SNOWFLAKE })) === "cus_replacement"
    );

    check(
        "a stale id is never persisted over",
        !stripeDb.calls.some((call) => call.text.includes('UPDATE "User"')),
        "the write only fills a NULL, so a wrong id cannot silently take its place"
    );

    /* --- losing a race yields the winner's customer --- */

    resetProbe(null);
    stripeDb.set('UPDATE "User"', () => ({ rowCount: 0 }));
    stripeFetch.queue({ json: { id: "cus_loser" } }, { json: {} });

    check(
        "when two checkouts race, the stored customer wins",
        (await stripe.ensureStripeCustomer({ discordId: SNOWFLAKE })) === null,
        "nothing was stored, so nothing is claimed"
    );

    check(
        "the redundant customer is cleaned up",
        stripeFetch.calls.some((call) => call.init.method === "DELETE"),
        stripeFetch.calls.map((call) => `${call.init.method ?? "GET"} ${call.url}`).join(" ")
    );

    /* --- nothing here may block a purchase --- */

    resetProbe(null);
    stripeFetch.queue({ ok: false, status: 502, json: {} });

    check(
        "a Stripe failure yields no customer instead of throwing",
        (await stripe.ensureStripeCustomer({ discordId: SNOWFLAKE })) === null
    );

    resetProbe(CUSTOMER_ID);

    check(
        "a malformed account id never reaches Stripe",
        (await stripe.ensureStripeCustomer({ discordId: "not-a-snowflake" })) === null &&
            stripeFetch.calls.length === 0
    );

    /* --- checkout attaches the customer and keeps its own attribution --- */

    resetProbe(CUSTOMER_ID);
    stripeFetch.queue(
        { json: { id: CUSTOMER_ID } },
        { json: { id: "cs_test_9", url: "https://checkout.stripe.com/c/cs_test_9" } }
    );

    const hosted = await provider.createCheckoutSession({
        plan: {
            id: "premium-annual",
            entitlementType: "PREMIUM",
            name: "Premium yearly",
            durationMonths: null,
            checkoutKey: "yearly",
            displayPrice: "$50 / year",
            blurb: "",
            providerPriceId: "price_annual",
        },
        discordId: SNOWFLAKE,
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/no",
    });

    const sessionCall = stripeFetch.calls.find((call) => call.url.includes("/v1/checkout/sessions"));

    check(
        "checkout redirects to the hosted page Stripe returned",
        hosted.url === "https://checkout.stripe.com/c/cs_test_9" &&
            hosted.providerSessionId === "cs_test_9"
    );

    check(
        "a recurring plan is sold in subscription mode",
        sessionCall?.form.get("mode") === "subscription",
        `mode was ${sessionCall?.form.get("mode")}`
    );

    check(
        "the account is stamped onto the subscription so renewals and refunds stay attributable",
        sessionCall?.form.get("subscription_data[metadata][discordId]") === SNOWFLAKE &&
            sessionCall.form.get("subscription_data[metadata][planId]") === "premium-annual",
        "Stripe does not copy the session's metadata onto the subscription"
    );

    check(
        "the session is created expanded so its price survives to the webhook",
        sessionCall?.form.get("expand[0]") === "line_items.data.price",
        "an unexpanded session has no line_items at all"
    );

    check(
        "no parameter that requires an embedded UI is sent",
        sessionCall?.form.get("redirect_on_completion") === null,
        "Stripe rejects redirect_on_completion unless ui_mode is embedded_page"
    );

    resetProbe(CUSTOMER_ID);
    stripeFetch.queue(
        { json: { id: CUSTOMER_ID } },
        { json: { id: "cs_test_10", url: "https://checkout.stripe.com/c/cs_test_10" } }
    );

    await provider.createCheckoutSession({
        plan: {
            id: "premium-quarter",
            entitlementType: "PREMIUM",
            name: "Premium 3 months",
            durationMonths: 3,
            checkoutKey: null,
            displayPrice: "$12.99 once",
            blurb: "",
            providerPriceId: "price_quarter",
        },
        discordId: SNOWFLAKE,
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/no",
    });

    const oneTimeCall = stripeFetch.calls.find((c) => c.url.includes("/v1/checkout/sessions"));

    check(
        "a one-time plan is still sold in payment mode",
        oneTimeCall?.form.get("mode") === "payment" &&
            oneTimeCall.form.get("line_items[0][price]") === "price_quarter",
        `mode was ${oneTimeCall?.form.get("mode")}`
    );

    check(
        "the price comes from the catalog, never the browser",
        sessionCall?.form.get("line_items[0][price]") === "price_annual" &&
            sessionCall.form.get("line_items[0][quantity]") === "1"
    );

    check(
        "the checkout session carries the stored customer",
        sessionCall?.form.get("customer") === CUSTOMER_ID
    );

    check(
        "attribution survives even with a customer attached",
        sessionCall?.form.get("client_reference_id") === SNOWFLAKE &&
            sessionCall.form.get("metadata[discordId]") === SNOWFLAKE &&
            sessionCall.form.get("metadata[planId]") === "premium-annual"
    );

    check(
        "the plan id sent to Stripe is the stored one, not the wire key",
        sessionCall?.form.get("metadata[planId]") === "premium-annual" &&
            !sessionCall.form.toString().includes("yearly")
    );

    resetProbe(null);
    stripeDb.set('UPDATE "User"', () => ({ rowCount: 1 }));
    stripeFetch.queue(
        { ok: false, status: 502, json: {} },
        { json: { id: "cs_test_11", url: "https://checkout.stripe.com/c/cs_test_11" } }
    );

    const checkoutWithoutCustomer = await provider.createCheckoutSession({
        plan: {
            id: "premium-monthly",
            entitlementType: "PREMIUM",
            name: "Premium monthly",
            durationMonths: null,
            checkoutKey: "monthly",
            displayPrice: "$5 / month",
            blurb: "",
            providerPriceId: "price_monthly",
        },
        discordId: SNOWFLAKE,
        successUrl: "https://example.test/ok",
        cancelUrl: "https://example.test/no",
    });

    const noCustomerCall = stripeFetch.calls.find((c) => c.url.includes("/v1/checkout/sessions"));

    check(
        "checkout still starts when the customer cannot be resolved",
        checkoutWithoutCustomer.url !== "" && !noCustomerCall.form.get("customer"),
        "a billing-history nicety must never block somebody from paying"
    );

    /* ---------------------------------------------------------------- */
    section("stripe — customer portal");

    const PORTAL_URL = "https://billing.stripe.com/p/session/abc";

    /* --- an account with billing history gets a portal --- */

    resetProbe(CUSTOMER_ID);
    stripeFetch.queue({ json: { id: "bps_1", url: PORTAL_URL } });

    const portal = await provider.createCustomerPortalSession({
        discordId: SNOWFLAKE,
        returnUrl: "https://example.test/dashboard/premium/billing?portal=returned",
    });

    const portalCall = stripeFetch.calls.find((call) => call.url.includes("/v1/billing_portal/sessions"));

    check(
        "a subscriber is sent to the portal Stripe returned",
        portal?.url === PORTAL_URL && portal.id === "bps_1"
    );

    check(
        "the portal is created with a form POST to Stripe's own endpoint",
        stripeFetch.calls.length === 1 &&
            portalCall?.init.method === "POST" &&
            portalCall.init.headers.Authorization === "Bearer sk_test_checkout_probe",
        stripeFetch.calls.map((call) => `${call.init.method ?? "GET"} ${call.url}`).join(" ")
    );

    check(
        "the portal points at the stored customer, not anything from the browser",
        portalCall?.form.get("customer") === CUSTOMER_ID
    );

    check(
        "the return url is passed through so Stripe sends them home",
        portalCall?.form.get("return_url") ===
            "https://example.test/dashboard/premium/billing?portal=returned"
    );

    /* --- an account with no billing history has nothing to manage --- */

    resetProbe(null);

    check(
        "an account with no stored customer gets no portal",
        (await provider.createCustomerPortalSession({
            discordId: SNOWFLAKE,
            returnUrl: "https://example.test/dashboard/premium/billing",
        })) === null
    );

    check(
        "that answer costs Stripe nothing — no call is made at all",
        stripeFetch.calls.length === 0,
        stripeFetch.calls.map((call) => call.url).join(" ")
    );

    resetProbe(CUSTOMER_ID);

    check(
        "a malformed account id never reaches Stripe",
        (await provider.createCustomerPortalSession({
            discordId: "not-a-snowflake",
            returnUrl: "https://example.test/dashboard/premium/billing",
        })) === null && stripeFetch.calls.length === 0
    );

    /* --- a real failure must be distinguishable from 'nothing here' --- */

    resetProbe(CUSTOMER_ID);
    stripeFetch.queue({
        ok: false,
        status: 400,
        json: { error: { message: "No configuration found for this customer's portal." } },
    });

    let portalFailure = null;

    try {
        await provider.createCustomerPortalSession({
            discordId: SNOWFLAKE,
            returnUrl: "https://example.test/dashboard/premium/billing",
        });
    } catch (error) {
        portalFailure = error;
    }

    check(
        "a Stripe rejection throws rather than reporting 'no portal'",
        portalFailure instanceof Error &&
            /No configuration found/.test(portalFailure.message),
        String(portalFailure)
    );

    resetProbe(CUSTOMER_ID);
    stripeFetch.queue({ json: { id: "bps_2" } });

    let urlFailure = null;

    try {
        await provider.createCustomerPortalSession({
            discordId: SNOWFLAKE,
            returnUrl: "https://example.test/dashboard/premium/billing",
        });
    } catch (error) {
        urlFailure = error;
    }

    check(
        "a portal session without a redirect URL is an error, not a broken link",
        urlFailure instanceof Error && /redirect URL/.test(urlFailure.message),
        String(urlFailure)
    );

    /* --- the page asks before offering the button --- */

    resetProbe(CUSTOMER_ID);

    check(
        "an account with a stored customer is offered the portal",
        (await provider.hasBillingRecord({ discordId: SNOWFLAKE })) === true &&
            stripeFetch.calls.length === 0,
        "this must be a database read, not a call to Stripe"
    );

    resetProbe(null);

    check(
        "an account with no billing history is not offered it",
        (await provider.hasBillingRecord({ discordId: SNOWFLAKE })) === false
    );

    resetProbe(CUSTOMER_ID);

    check(
        "a malformed account id is never offered the portal",
        (await provider.hasBillingRecord({ discordId: "not-a-snowflake" })) === false
    );

    globalThis.fetch = realFetch;
    delete process.env.STRIPE_SECRET_KEY;

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

    /*
     * The quarter plan is the only one-time option in the catalog, so it
     * has to be configured for this case. Subscriptions take their window
     * from Stripe instead, which the case above already covers.
     */
    process.env.PREMIUM_QUARTER_PRICE_ID = "price_quarter";

    const oneTime = await (async () => {
        const db2 = fakeDb();
        db2.on("INSERT INTO \"PaymentEventRecord\"", () => ({ rows: [{ id: "r" }], rowCount: 1 }));

        return loadApply(db2).applyPaymentEvent("stripe", {
            id: "evt_2",
            kind: "checkout_completed",
            discordId: "123456789012345678",
            planId: "premium-quarter",
            skuId: "price_quarter",
            externalEntitlementId: null,
            currentPeriodEnd: null,
            raw: {},
        });
    })();

    check(
        "a one-time purchase gets its window from the catalog",
        oneTime.status === "applied" &&
            grantCalls[0].input.endsAt.getTime() - Date.now() >
                85 * 24 * 60 * 60 * 1000 &&
            grantCalls[0].input.endsAt.getTime() - Date.now() <
                95 * 24 * 60 * 60 * 1000,
        grantCalls[0].input.endsAt?.toISOString()
    );

    delete process.env.PREMIUM_QUARTER_PRICE_ID;

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

    check(
        "a paid grant asks to preserve permanent entitlements",
        grantCalls.every((call) => call.input.preservePermanent === true) &&
            grantCalls.length > 0,
        "buying Premium must not switch off a grant that never expires"
    );

    /* ---------------------------------------------------------------- */
    section("entitlements — a purchase must not erase a permanent grant");

    const entDb = fakeDb();
    entDb.on('FROM "User"', () => ({ rows: [{ id: "user-1" }] }));
    entDb.on('UPDATE "Entitlement"', () => ({ rows: [], rowCount: 1 }));
    entDb.on('INSERT INTO "Entitlement"', () => ({
        rows: [
            {
                id: "ent-new",
                type: "PREMIUM",
                source: "stripe",
                active: true,
                skuId: "price_monthly",
                externalEntitlementId: "sub_1",
                startsAt: new Date("2026-01-01T00:00:00Z"),
                endsAt: new Date("2026-02-01T00:00:00Z"),
            },
        ],
        rowCount: 1,
    }));

    const entitlements = loadModule(ENTITLEMENTS_PATH, {
        "./database": {
            query: entDb.query,
            withTransaction: async (fn) => fn({ query: entDb.query }),
        },
        "./notifications": {
            createNotificationForDiscordUser: async () => true,
        },
    });

    await entitlements.grantEntitlement("123456789012345678", {
        type: "PREMIUM",
        source: "stripe",
        endsAt: new Date("2026-02-01T00:00:00Z"),
        externalEntitlementId: "sub_1",
        preservePermanent: true,
    });

    const supersede = entDb.calls.find(
        (call) =>
            /UPDATE "Entitlement"/.test(call.text) &&
            /"active" = false/.test(call.text) &&
            !/"externalEntitlementId" = \$1/.test(call.text)
    );

    check(
        "the supersede pass can exclude rows with no end date",
        supersede !== undefined &&
            /"endsAt" IS NOT NULL/.test(supersede.text) &&
            supersede.params[2] === true,
        supersede ? supersede.text.replace(/\s+/g, " ").trim() : "no supersede statement ran"
    );

    entDb.calls.length = 0;

    await entitlements.grantEntitlement("123456789012345678", {
        type: "PREMIUM",
        source: "stripe",
        endsAt: new Date("2026-02-01T00:00:00Z"),
        externalEntitlementId: "sub_2",
    });

    const plainSupersede = entDb.calls.find(
        (call) =>
            /UPDATE "Entitlement"/.test(call.text) &&
            /"active" = false/.test(call.text) &&
            !/"externalEntitlementId" = \$1/.test(call.text)
    );

    check(
        "a grant without the flag still supersedes everything",
        plainSupersede !== undefined && plainSupersede.params[2] === false,
        "the dev endpoint and staff grants must keep their old behaviour"
    );

    entDb.calls.length = 0;

    await entitlements.grantEntitlement("123456789012345678", {
        type: "PREMIUM",
        source: "grandfather",
        endsAt: null,
        externalEntitlementId: "grandfather:1",
        preservePermanent: true,
    });

    const permanentSupersede = entDb.calls.find(
        (call) =>
            /UPDATE "Entitlement"/.test(call.text) &&
            /"active" = false/.test(call.text) &&
            !/"externalEntitlementId" = \$1/.test(call.text)
    );

    check(
        "a permanent grant supersedes even a flagged one",
        permanentSupersede !== undefined && permanentSupersede.params[2] === false,
        "permanent access is strictly better than the period it replaces"
    );

    /*
     * The summary is what every Premium page renders. With two live rows
     * it must describe the permanent one, or a grandfathered account that
     * also pays is told its access ends on the renewal date.
     */
    function summaryOf(rows) {
        const db = fakeDb();
        db.on("FROM \"Entitlement\" e", () => ({ rows }));

        const mod = loadModule(ENTITLEMENTS_PATH, {
            "./database": {
                query: db.query,
                withTransaction: async (fn) => fn({ query: db.query }),
            },
            "./notifications": {
                createNotificationForDiscordUser: async () => true,
            },
        });

        return mod.getEntitlementSummary("1");
    }

    const permanentRow = {
        id: "ent-gf",
        type: "PREMIUM",
        source: "grandfather",
        active: true,
        skuId: null,
        externalEntitlementId: "grandfather:1",
        startsAt: new Date("2025-01-01T00:00:00Z"),
        endsAt: null,
    };

    const paidRow = {
        id: "ent-paid",
        type: "PREMIUM",
        source: "stripe",
        active: true,
        skuId: "price_monthly",
        externalEntitlementId: "sub_1",
        startsAt: new Date("2026-01-01T00:00:00Z"),
        endsAt: new Date("2026-02-01T00:00:00Z"),
    };

    /* Paid first in the list, as `startsAt DESC` would return it. */
    const bothSummary = await summaryOf([paidRow, permanentRow]);

    check(
        "the permanent row wins when both are live",
        bothSummary.premium?.id === "ent-gf",
        `got ${bothSummary.premium?.id}`
    );

    check(
        "so the account is told its access has no end date",
        bothSummary.renewsAt === null,
        String(bothSummary.renewsAt)
    );

    const paidOnly = await summaryOf([paidRow]);

    check(
        "a paying account still reports its renewal date",
        paidOnly.premium?.id === "ent-paid" &&
            paidOnly.renewsAt?.toISOString() === "2026-02-01T00:00:00.000Z"
    );

    check(
        "and is not labelled promotional",
        paidOnly.isPromotional === false
    );

    const gfOnly = await summaryOf([permanentRow]);

    check(
        "a grandfathered account is Premium",
        gfOnly.plan === "PREMIUM" && gfOnly.renewsAt === null
    );

    /*
     * The grandfather pass used to bail out whenever any Premium was
     * active, which is exactly why a wiped permanent row stayed wiped.
     */
    const gfCalls = [];

    const grandfather = loadModule(GRANDFATHER_PATH, {
        "./entitlements": {
            grantEntitlement: async (discordId, input) => {
                gfCalls.push({ discordId, input });

                return { id: "ent-gf", type: "PREMIUM", source: "grandfather" };
            },
            hasEntitlement: async () => true,
        },
    });

    process.env.GRANDFATHER_IDS = "999999999999999999";

    await grandfather.ensureGrandfatheredEntitlement("999999999999999999");

    check(
        "sign-in re-asserts the permanent grant even while Premium is active",
        gfCalls.length === 1 && gfCalls[0].input.endsAt === null,
        `${gfCalls.length} grants`
    );

    check(
        "the re-assert is keyed so it updates rather than stacks",
        gfCalls[0]?.input.externalEntitlementId === "grandfather:999999999999999999"
    );

    gfCalls.length = 0;

    await grandfather.ensureGrandfatheredEntitlement("888888888888888888");

    check(
        "an account that is not grandfathered is left alone",
        gfCalls.length === 0
    );

    /* ---------------------------------------------------------------- */
    section("provider selection");

    resetEnv();

    /*
     * `stripe.ts` reaches the database to look up a stored customer, so the
     * provider module needs a stand-in even when only selection is tested.
     */
    const index = loadModule(INDEX_PATH, {
        "../database": {
            query: async () => {
                throw new Error("testPayments: provider selection must not touch the database");
            },
        },
    });

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
        /findPlanByCheckoutKey\(/.test(checkoutSource) &&
            !/price|amount|currency/i.test(
                (checkoutSource.match(/formData\?\.get\("[^"]+"\)/g) || []).join(" ")
            )
    );

    check(
        "checkout accepts only the short wire keys, not a stored id",
        !/findSellablePlan\(/.test(checkoutSource) &&
            /findPlanByCheckoutKey\(/.test(checkoutSource)
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
        "the checkout form sends only a plan key",
        /action="\/api\/billing\/checkout"/.test(pageSource) &&
            /name="plan"/.test(pageSource) &&
            /value=\{\s*plan\.checkoutKey \?\? plan\.id\s*\}/.test(pageSource) &&
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
    section("portal route — source contracts");

    const portalSource = readSource(PORTAL_ROUTE);

    check(
        "the portal requires a verified session",
        /verifySessionToken\(/.test(portalSource) &&
            /SESSION_COOKIE_NAME/.test(portalSource)
    );

    check(
        "the portal targets the session's account and nothing else",
        /discordId:\s*session\.discordId/.test(portalSource) &&
            !/formData/.test(portalSource),
        "a route that cancels subscriptions must accept no identifiers from the browser"
    );

    check(
        "the portal refuses a provider without portal support",
        /provider\?\.createCustomerPortalSession/.test(portalSource) &&
            /status:\s*404/.test(portalSource)
    );

    check(
        "an account with no billing record is told so, not redirected",
        /if \(!portal\)/.test(portalSource) &&
            /no subscription to manage/.test(portalSource)
    );

    check(
        "the portal is a redirect to the provider's hosted page",
        /NextResponse\.redirect\(portal\.url/.test(portalSource)
    );

    check(
        "the portal grants and revokes nothing itself",
        !/grantEntitlement|revokeEntitlement/.test(portalSource),
        "only the signed webhook changes access"
    );

    check(
        "a provider failure is logged, not shown to the customer",
        /console\.error\(/.test(portalSource) &&
            /status:\s*502/.test(portalSource) &&
            !/error:\s*\{\s*message/.test(portalSource)
    );

    check(
        "the billing page offers the portal only when one exists",
        /portalAvailable/.test(pageSource) &&
            /action="\/api\/billing\/portal"/.test(pageSource) &&
            /hasBillingRecord/.test(pageSource)
    );

    check(
        "the portal button sends no data of its own",
        !/name="(customer|subscription|discordId|price)"/.test(pageSource)
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

    check(
        "the account row can hold one Stripe customer",
        /model User \{[\s\S]*?stripeCustomerId String\? @unique[\s\S]*?\n\}/.test(schema),
        "one customer per account is the whole point of the column"
    );

    const customerMigration = path.join(
        ROOT,
        "prisma",
        "migrations",
        "20261006160000_add_stripe_customer_id",
        "migration.sql"
    );

    check(
        "a migration adds the customer column and its unique index",
        fs.existsSync(customerMigration) &&
            /ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT/.test(readSource(customerMigration)) &&
            /CREATE UNIQUE INDEX "User_stripeCustomerId_key"/.test(readSource(customerMigration)),
        "the schema and the database must agree or migrate deploy fails"
    );

    /* ---------------------------------------------------------------- */
    section("the app never touches card data");

    const paymentsSources = [
        STRIPE_PATH,
        CATALOG_PATH,
        INDEX_PATH,
        APPLY_PATH,
        CHECKOUT_ROUTE,
        PORTAL_ROUTE,
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
