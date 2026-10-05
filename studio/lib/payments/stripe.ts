import {
    constantTimeEquals,
} from "../auth";

import { query } from "../database";

import type {
    CheckoutSession,
    CustomerPortalSession,
    PaymentEvent,
    PaymentProvider,
    SellablePlan,
} from "./types";

/*
 * Stripe implementation of PaymentProvider.
 *
 * Two deliberate choices:
 *
 * 1. The REST API is called with fetch rather than the `stripe` npm SDK.
 *    The Studio runs as a Cloudflare Worker, where the SDK's Node http
 *    transport is a poor fit and the dependency buys nothing: this file
 *    needs a handful of endpoints, all of them form-encoded POSTs.
 *
 * 2. The signature is verified here with Web Crypto instead of
 *    `stripe.webhooks.constructEvent`. Stripe's scheme is documented and
 *    short, and verifying it ourselves means the check exists even in a
 *    runtime where the SDK cannot load.
 *
 * The app never sees a card number, so it never holds anything that
 * would make it a PCI target: the browser talks only to the hosted page
 * at checkout.stripe.com.
 */

const STRIPE_API = "https://api.stripe.com";

/**
 * Reject a webhook whose timestamp is this far from now.
 *
 * Without this, one captured request body and its signature would be
 * replayable forever, because the signature itself never expires.
 */
const MAX_SIGNATURE_AGE_SECONDS = 300;

function required(name: string): string {
    const value = (process.env[name] ?? "").trim();

    if (!value) {
        throw new Error(
            `Payment provider is missing configuration: ${name}`
        );
    }

    return value;
}

async function hmacSha256Hex(
    secret: string,
    payload: string
): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(payload)
    );

    return Array.from(new Uint8Array(signature))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Verifies Stripe's `Stripe-Signature` header against the raw body.
 *
 * The header carries a timestamp and one or more `v1=` signatures:
 *   t=1700000000,v1=5257a...,...,v1=abc...
 *
 * Every `v1` value is compared, because during a secret rotation Stripe
 * signs with both the old and new secret and either may be valid.
 * Comparison is constant-time.
 *
 * The signed string is `${timestamp}.${rawBody}`. It must be the exact
 * bytes received: re-serialising the parsed JSON changes key order or
 * whitespace and every signature then fails, which is why the route
 * reads the body as text before parsing it.
 */
async function verifySignature(input: {
    body: string;
    header: string;
    secret: string;
}): Promise<boolean> {
    const parts = new Map<string, string[]>();

    for (const pair of input.header.split(",")) {
        const index = pair.indexOf("=");

        if (index < 1) {
            continue;
        }

        const key = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();

        parts.set(key, [...(parts.get(key) ?? []), value]);
    }

    const timestamps = parts.get("t") ?? [];
    const signatures = parts.get("v1") ?? [];

    if (timestamps.length === 0 || signatures.length === 0) {
        return false;
    }

    const timestamp = Number(timestamps[0]);

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return false;
    }

    const ageSeconds =
        Math.floor(Date.now() / 1000) - timestamp;

    if (
        ageSeconds > MAX_SIGNATURE_AGE_SECONDS ||
        ageSeconds < -MAX_SIGNATURE_AGE_SECONDS
    ) {
        return false;
    }

    const expected = await hmacSha256Hex(
        input.secret,
        `${timestamps[0]}.${input.body}`
    );

    return signatures.some((candidate) =>
        constantTimeEquals(candidate, expected)
    );
}

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
}

function readString(
    source: Record<string, unknown>,
    key: string
): string | null {
    const value = source[key];

    return typeof value === "string" && value.trim()
        ? value
        : null;
}

function readNumber(
    source: Record<string, unknown>,
    key: string
): number | null {
    const value = source[key];

    return typeof value === "number" && Number.isFinite(value)
        ? value
        : null;
}

function fromUnix(seconds: number | null): Date | null {
    return seconds === null
        ? null
        : new Date(seconds * 1000);
}

/**
 * Reads one object back out of Stripe.
 *
 * Webhook payloads are deliberately thin: a `checkout.session.completed`
 * names the subscription but does not describe it, and the field that
 * decides how long Premium lasts lives on the subscription itself. Fetching
 * is the only way to read it.
 *
 * Every failure — no key, a non-2xx, a network error, a body that is not
 * JSON — returns null rather than throwing. A webhook must be answered
 * quickly and exactly once; failing the fetch must degrade to "we could not
 * confirm the period", never to a 500 that makes Stripe redeliver a payment
 * we have already recorded.
 */
async function stripeGet(
    secretKey: string,
    path: string
): Promise<Record<string, unknown> | null> {
    if (!secretKey) {
        return null;
    }

    try {
        const response = await fetch(`${STRIPE_API}${path}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${secretKey}`,
            },
        });

        if (!response.ok) {
            return null;
        }

        return asRecord(await response.json().catch(() => ({})));
    } catch {
        return null;
    }
}

/**
 * The first row of a Stripe list response, or null.
 */
function firstListRow(
    list: Record<string, unknown> | null
): Record<string, unknown> | null {
    const data = asRecord(list).data;

    return Array.isArray(data) && data.length > 0
        ? asRecord(data[0])
        : null;
}

/**
 * The end of the period Stripe actually billed for.
 *
 * Current API versions removed `current_period_end` from the Subscription
 * object; the clock now lives on each subscription *item*. The old
 * top-level field is still read as a fallback so a deployment pinned to an
 * older version keeps working.
 */
function periodEndFromSubscription(
    subscription: Record<string, unknown>
): Date | null {
    const items = asRecord(subscription.items).data;

    if (Array.isArray(items)) {
        for (const item of items) {
            const end = fromUnix(
                readNumber(
                    asRecord(item),
                    "current_period_end"
                )
            );

            if (end) {
                return end;
            }
        }
    }

    return fromUnix(
        readNumber(subscription, "current_period_end")
    );
}

/**
 * The price a subscription is billed at, read from its first item.
 *
 * Stripe expands `items[].price` into the full price object here, so the id
 * is one level deeper than it looks.
 */
function priceIdFromSubscription(
    subscription: Record<string, unknown>
): string | null {
    const items = asRecord(subscription.items).data;

    if (!Array.isArray(items) || items.length === 0) {
        return null;
    }

    return readString(
        asRecord(asRecord(items[0]).price),
        "id"
    );
}

/**
 * Reads the Discord id back out of a checkout session.
 *
 * The id was written into `client_reference_id` and metadata by
 * `createCheckoutSession` below. Because the object being read comes
 * from a signature-verified payload, it is the same value this app put
 * in — not something a browser chose.
 */
function discordIdFromSession(
    session: Record<string, unknown>
): string | null {
    const metadata = asRecord(session.metadata);

    return (
        readString(metadata, "discordId") ??
        readString(session, "client_reference_id")
    );
}

function planIdFromSession(
    session: Record<string, unknown>
): string | null {
    const metadata = asRecord(session.metadata);

    return readString(metadata, "planId");
}

function priceIdFromSession(
    session: Record<string, unknown>
): string | null {
    const lines = asRecord(session.line_items).data;

    if (Array.isArray(lines) && lines.length > 0) {
        const price = asRecord(
            asRecord(lines[0]).price
        );

        const id = readString(price, "id");

        if (id) {
            return id;
        }
    }

    return null;
}

/**
 * Everything the app needs to know about the subscription behind an invoice.
 *
 * Current API versions removed `invoice.subscription` and
 * `invoice.checkout_session`; the link now lives at
 * `invoice.parent.subscription_details.subscription`, and the identity this
 * app stamped onto the subscription is echoed back in the sibling
 * `metadata`. Without both, a renewal or a refund cannot be attributed to
 * anybody.
 */
function subscriptionContextFromInvoice(
    invoice: Record<string, unknown> | null
): {
    subscriptionId: string | null;
    discordId: string | null;
    planId: string | null;
} {
    const details = asRecord(
        asRecord(asRecord(invoice).parent).subscription_details
    );
    const metadata = asRecord(details.metadata);

    return {
        subscriptionId: readString(details, "subscription"),
        discordId: readString(metadata, "discordId"),
        planId: readString(metadata, "planId"),
    };
}

/**
 * The invoice a payment belongs to, given a payment intent id.
 *
 * Stripe no longer puts the invoice id on the PaymentIntent; it is echoed
 * in `payment_details.order_reference`. That reference is set for invoice
 * payments, which is exactly the subscription case that matters here.
 */
async function invoiceIdForPaymentIntent(
    secretKey: string,
    paymentIntentId: string
): Promise<string | null> {
    const intent = await stripeGet(
        secretKey,
        `/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`
    );

    return readString(
        asRecord(asRecord(intent).payment_details),
        "order_reference"
    );
}

/**
 * The subscription behind a refunded charge, and who it belonged to.
 *
 * A refund is the one event whose payload has no usable identity: the
 * Charge carries no invoice, no checkout session and no metadata of ours —
 * only the customer. So the path back has to be walked:
 *
 *   charge → payment intent → invoice → subscription (+ its metadata)
 *
 * Each hop is a lookup, and any of them may fail. Returning nulls is
 * correct: the event is then recorded and ignored rather than guessing at
 * an account to revoke Premium from.
 */
async function contextForCharge(
    secretKey: string,
    charge: Record<string, unknown>
): Promise<{
    subscriptionId: string | null;
    discordId: string | null;
    planId: string | null;
}> {
    const empty = {
        subscriptionId: null,
        discordId: null,
        planId: null,
    };

    const paymentIntentId = readString(charge, "payment_intent");

    if (!paymentIntentId) {
        return empty;
    }

    const invoiceId = await invoiceIdForPaymentIntent(
        secretKey,
        paymentIntentId
    );

    if (invoiceId) {
        const invoice = await stripeGet(
            secretKey,
            `/v1/invoices/${encodeURIComponent(invoiceId)}`
        );

        const context = subscriptionContextFromInvoice(invoice);

        if (context.subscriptionId && context.discordId) {
            return context;
        }

        /*
         * The subscription exists but predates this app's metadata — a
         * purchase made before the stamping below, or one created directly
         * in the dashboard. Reading the subscription recovers the plan, and
         * possibly the account.
         */
        if (context.subscriptionId) {
            const subscription = await stripeGet(
                secretKey,
                `/v1/subscriptions/${encodeURIComponent(context.subscriptionId)}`
            );

            const metadata = asRecord(
                asRecord(subscription).metadata
            );

            return {
                subscriptionId: context.subscriptionId,
                discordId:
                    context.discordId ??
                    readString(metadata, "discordId"),
                planId:
                    context.planId ??
                    readString(metadata, "planId"),
            };
        }
    }

    /*
     * A one-time purchase has no invoice to walk back to, so the only
     * handle left is the customer. A customer with exactly one subscription
     * is unambiguous; more than one is not, and revoking the wrong one is
     * worse than revoking nothing.
     */
    const customerId = readString(charge, "customer");

    if (!customerId) {
        return empty;
    }

    const list = await stripeGet(
        secretKey,
        `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=2`
    );

    const rows = asRecord(list).data;

    if (!Array.isArray(rows) || rows.length !== 1) {
        return empty;
    }

    const subscription = asRecord(rows[0]);
    const metadata = asRecord(subscription.metadata);

    return {
        subscriptionId: readString(subscription, "id"),
        discordId: readString(metadata, "discordId"),
        planId: readString(metadata, "planId"),
    };
}

/**
 * Turns one Stripe event into zero or more app events.
 *
 * Zero is the normal answer for most of Stripe's catalogue. An event we
 * do not understand is ignored rather than guessed at; the route logs
 * the type so a new one shows up in the logs instead of being applied
 * wrongly.
 *
 * Async because Stripe's thinner payloads mean the deciding fields often
 * live on a related object that has to be fetched. A failed fetch never
 * throws — see `stripeGet`.
 */
async function toPaymentEvents(
    event: unknown
): Promise<PaymentEvent[]> {
    const envelope = asRecord(event);
    const type = readString(envelope, "type") ?? "";
    const id = readString(envelope, "id");

    if (!id) {
        return [];
    }

    const data = asRecord(asRecord(envelope).data);
    const object = asRecord(data.object);

    const secretKey = (
        process.env.STRIPE_SECRET_KEY ?? ""
    ).trim();

    switch (type) {
        case "checkout.session.completed": {
            /*
             * A completed checkout is not necessarily a paid one: an
             * invoice-less subscription or a zero-amount session reaches
             * the same event. Paying attention to payment_status is what
             * stops free access leaking from a session Stripe never
             * collected money for.
             */
            const status = readString(
                object,
                "payment_status"
            );

            if (status && status !== "paid") {
                return [];
            }

            const subscriptionId = readString(
                object,
                "subscription"
            );

            /*
             * How long the paid window runs.
             *
             * The Checkout Session has no period fields at all — it is a
             * receipt, not a clock. For a subscription the clock belongs to
             * the subscription, so it has to be read back. For a one-time
             * purchase there is no clock and `null` is the honest answer;
             * the catalog then decides the window from the plan.
             *
             * Getting this wrong in the `null` direction is not harmless:
             * the monthly and annual plans carry no duration of their own
             * precisely because Stripe is meant to own the clock, so a null
             * here turns one month's payment into Premium forever.
             */
            let currentPeriodEnd: Date | null = null;
            let skuId = priceIdFromSession(object);

            if (subscriptionId) {
                const subscription = await stripeGet(
                    secretKey,
                    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`
                );

                currentPeriodEnd =
                    periodEndFromSubscription(
                        asRecord(subscription)
                    );

                /*
                 * Older sessions were created before the session itself was
                 * expanded, so they carry no line items; the subscription
                 * always knows its price.
                 */
                skuId =
                    skuId ??
                    priceIdFromSubscription(
                        asRecord(subscription)
                    );
            }

            return [
                {
                    id,
                    kind: "checkout_completed",
                    discordId:
                        discordIdFromSession(object),
                    planId: planIdFromSession(object),
                    skuId,
                    currentPeriodEnd,
                    externalEntitlementId: subscriptionId,
                    raw: event,
                },
            ];
        }

        case "invoice.paid":
        case "invoice.payment_succeeded": {
            /*
             * Renewals arrive as invoices, and only subscriptions have
             * one. The billing reason distinguishes a genuine renewal
             * from the subscription's first invoice, which was already
             * handled by checkout.session.completed.
             */
            const billingReason = readString(
                object,
                "billing_reason"
            );

            if (
                billingReason !==
                "subscription_cycle"
            ) {
                return [];
            }

            const lines = asRecord(object.lines).data;
            const first = Array.isArray(lines)
                ? asRecord(lines[0])
                : {};

            const context =
                subscriptionContextFromInvoice(object);

            /*
             * Which period this invoice pays for.
             *
             * `invoice.period_end` still exists but is no longer the end of
             * the billing period — on this API version it equals
             * `period_start`, the day the invoice was raised. Using it would
             * extend Premium to a date already in the past, so the paid
             * period is read from the line that was actually billed.
             */
            const linePeriod = asRecord(first.period);

            /*
             * The price is a bare id on a line item, not an expanded
             * object; older versions nested a `price` object instead.
             */
            const priceDetails = asRecord(
                asRecord(first.pricing).price_details
            );

            return [
                {
                    id,
                    kind: "subscription_renewed",
                    discordId:
                        context.discordId ??
                        readString(
                            object,
                            "client_reference_id"
                        ),
                    planId: context.planId,
                    skuId:
                        readString(priceDetails, "price") ??
                        readString(
                            asRecord(first.price),
                            "id"
                        ),
                    currentPeriodEnd:
                        fromUnix(
                            readNumber(linePeriod, "end")
                        ) ??
                        fromUnix(
                            readNumber(object, "period_end")
                        ) ??
                        fromUnix(
                            readNumber(
                                object,
                                "current_period_end"
                            )
                        ),
                    externalEntitlementId:
                        context.subscriptionId,
                    raw: event,
                },
            ];
        }

        case "customer.subscription.deleted": {
            return [
                {
                    id,
                    kind: "subscription_canceled",
                    discordId:
                        discordIdFromSession(object),
                    planId: planIdFromSession(object),
                    skuId: null,
                    currentPeriodEnd: fromUnix(
                        readNumber(object, "ended_at")
                    ),
                    externalEntitlementId: readString(
                        object,
                        "id"
                    ),
                    raw: event,
                },
            ];
        }

        case "charge.refunded": {
            /*
             * The charge in this payload carries a customer and a payment
             * intent and nothing else — no invoice, no session, and none of
             * the metadata this app stamped, because Stripe does not copy
             * those onto a charge. Revoking Premium therefore depends on
             * walking back to the subscription that was paid for.
             *
             * `externalEntitlementId` must be the subscription id, not the
             * charge id: entitlements are stored under the subscription, and
             * a refund that reports a different identifier can never match
             * the row it is meant to revoke.
             */
            const context = await contextForCharge(
                secretKey,
                object
            );

            return [
                {
                    id,
                    kind: "refund_issued",
                    discordId: context.discordId,
                    planId: context.planId,
                    skuId: null,
                    currentPeriodEnd: null,
                    externalEntitlementId:
                        context.subscriptionId,
                    raw: event,
                },
            ];
        }

        default:
            return [];
    }
}

/**
 * Reads the customer id already stored for an account.
 *
 * Returns null both when the account has never bought anything and when
 * the account does not exist, which is the correct answer for checkout
 * either way: no customer to attach.
 */
async function readStoredCustomerId(
    discordId: string
): Promise<string | null> {
    const result = await query<{ stripeCustomerId: string | null }>(
        `
        SELECT "stripeCustomerId"
        FROM "User"
        WHERE "discordId" = $1
        `,
        [discordId]
    );

    return result.rows[0]?.stripeCustomerId ?? null;
}

/**
 * The Stripe customer already on record for an account, if any.
 *
 * Exported for the customer portal, which — unlike checkout — cannot
 * proceed without one. Checkout can let Stripe invent a customer; a
 * portal has to point at an existing billing record, so "no stored id"
 * genuinely means "nothing to show".
 */
export async function getStoredStripeCustomerId(
    discordId: string
): Promise<string | null> {
    const id = (discordId ?? "").trim();

    if (!/^\d{17,20}$/.test(id)) {
        return null;
    }

    try {
        return await readStoredCustomerId(id);
    } catch (error) {
        console.error("[billing] stored customer lookup failed", error);

        return null;
    }
}

/**
 * Stores a customer id against an account.
 *
 * The `IS NULL` guard is what makes this safe to call twice: two
 * checkouts started in the same second would otherwise both write, and
 * the second would either overwrite the first or hit the unique index.
 * The return value says whether this write won, so the caller can tell
 * "this is my customer" from "somebody else already stored one".
 */
async function storeCustomerId(
    discordId: string,
    customerId: string
): Promise<boolean> {
    const result = await query(
        `
        UPDATE "User"
        SET "stripeCustomerId" = $2
        WHERE "discordId" = $1
          AND "stripeCustomerId" IS NULL
        `,
        [discordId, customerId]
    );

    return (result.rowCount ?? 0) > 0;
}

/**
 * Creates a Stripe customer for an account.
 *
 * No email is set: the session carries a Discord identity and nothing
 * else, and inventing an email would be worse than leaving it blank.
 * Checkout collects one from the buyer and Stripe stores it on the
 * customer itself. The Discord id goes into metadata so the mapping can
 * be recovered from Stripe's side when support asks who a customer is.
 */
async function createStripeCustomer(
    secretKey: string,
    discordId: string
): Promise<string | null> {
    const form = new URLSearchParams();

    form.set("metadata[discordId]", discordId);

    const response = await fetch(`${STRIPE_API}/v1/customers`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
    });

    if (!response.ok) {
        return null;
    }

    return readString(asRecord(await response.json().catch(() => ({}))), "id");
}

/**
 * True when Stripe still has this customer.
 *
 * A stored id can go stale — a customer deleted in the dashboard, or an
 * id carried over from a different Stripe account after a key rotation.
 * Checkout would then fail with "No such customer", so the id is checked
 * before it is sent and recreated if it is gone.
 */
async function stripeCustomerExists(
    secretKey: string,
    customerId: string
): Promise<boolean> {
    const response = await fetch(
        `${STRIPE_API}/v1/customers/${encodeURIComponent(customerId)}`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${secretKey}`,
            },
        }
    );

    if (response.ok) {
        return true;
    }

    /*
     * Only a definite "not found" justifies recreating. A 401 or a 5xx
     * means we do not know, and discarding a good customer id over a
     * transient error would silently split a person's billing history.
     */
    return false;
}

/**
 * Best-effort removal of a customer that turned out to be redundant.
 *
 * Reached when two checkouts raced and both created a customer; only one
 * could be stored. Stripe refuses to delete a customer that already has
 * a subscription, invoice or payment method attached, so this can never
 * destroy anything a real buyer used.
 */
async function deleteStripeCustomer(
    secretKey: string,
    customerId: string
): Promise<void> {
    await fetch(
        `${STRIPE_API}/v1/customers/${encodeURIComponent(customerId)}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${secretKey}`,
            },
        }
    ).catch(() => undefined);
}

/**
 * Finds — or creates — the Stripe customer for one account.
 *
 * The invariant is one customer per account, held in `User.stripeCustomerId`
 * and never supplied by the browser. Without it every purchase would mint a
 * fresh customer, scattering a person's subscriptions, invoices and saved
 * cards across ids nothing can tie together.
 *
 * Deliberately returns null instead of throwing. A customer is a
 * convenience: Stripe creates one itself if checkout is sent without it, so
 * a database blip or a Stripe outage must not stop somebody from paying.
 * The purchase is still attributed through `client_reference_id` and
 * metadata, which do not depend on this at all.
 */
export async function ensureStripeCustomer(input: {
    discordId: string;
    secretKey?: string;
}): Promise<string | null> {
    const discordId = (input.discordId ?? "").trim();

    if (!/^\d{17,20}$/.test(discordId)) {
        return null;
    }

    let secretKey = input.secretKey;

    try {
        secretKey ??= required("STRIPE_SECRET_KEY");

        const stored = await readStoredCustomerId(discordId);

        if (stored) {
            if (await stripeCustomerExists(secretKey, stored)) {
                return stored;
            }

            /*
             * The stored id is dead. Clearing it is not required — the
             * write below only fills a NULL — so the row is left alone and
             * a replacement is simply not persisted. That is the safe
             * direction to be wrong in: a missing customer costs one extra
             * Stripe object, whereas a wrong id in the database would be
             * charged to every future purchase.
             */
            const replacement = await createStripeCustomer(secretKey, discordId);

            return replacement;
        }

        const created = await createStripeCustomer(secretKey, discordId);

        if (!created) {
            return null;
        }

        const won = await storeCustomerId(discordId, created);

        if (won) {
            return created;
        }

        /*
         * The write matched no row. Either another checkout stored a
         * customer in the same instant, or the account does not exist at
         * all. Re-reading tells the two apart.
         */
        const winner = await readStoredCustomerId(discordId);

        if (winner) {
            if (winner !== created) {
                await deleteStripeCustomer(secretKey, created);
            }

            return winner;
        }

        /*
         * No account to hold it, so the customer would be an orphan
         * nothing can ever attribute. Stripe refuses to delete a customer
         * that has been used, so this cannot destroy a real purchase.
         */
        await deleteStripeCustomer(secretKey, created);

        return null;
    } catch (error) {
        console.error("[billing] stripe customer lookup failed", error);

        return null;
    }
}

export const stripeProvider: PaymentProvider = {
    name: "stripe",

    async createCheckoutSession({
        plan,
        discordId,
        successUrl,
        cancelUrl,
    }): Promise<CheckoutSession> {
        const secretKey = required("STRIPE_SECRET_KEY");

        /*
         * Resolved before the session is built so that a Stripe outage or
         * a missing account surfaces as the checkout failing to start,
         * not as a half-created session the customer never sees.
         */
        const customerId = await ensureStripeCustomer({
            discordId,
            secretKey,
        });

        const form = new URLSearchParams();

        /*
         * A Stripe price that recurs must be sold in `subscription` mode
         * and a one-off price in `payment` mode; sending the wrong one is
         * a hard error from Stripe. The app cannot tell from the price id
         * alone, so the catalog declares it: a plan with no app-owned
         * duration is the provider's recurring one.
         */
        form.set("mode", plan.durationMonths ? "payment" : "subscription");
        form.set("line_items[0][price]", plan.providerPriceId);
        form.set("line_items[0][quantity]", "1");

        /*
         * Attaching the customer means Stripe reuses one person's saved
         * payment methods, invoices and subscription history instead of
         * inventing a new customer per purchase. It is optional: if the
         * lookup above could not reach Stripe, the checkout still works
         * and Stripe creates a customer of its own.
         */
        if (customerId) {
            form.set("customer", customerId);
        }

        /*
         * Both of these are read back out of the verified webhook. They
         * are how a purchase becomes an entitlement for the right
         * account without the browser ever naming a recipient.
         *
         * On the session alone they are enough, but Stripe does not copy
         * them onto the subscription or onto the invoices that follow.
         * Stamping the subscription as well is what lets a renewal — and a
         * refund months later — still be traced back to an account.
         */
        form.set("client_reference_id", discordId);
        form.set("metadata[discordId]", discordId);
        form.set("metadata[planId]", plan.id);

        if (!plan.durationMonths) {
            form.set(
                "subscription_data[metadata][discordId]",
                discordId
            );
            form.set(
                "subscription_data[metadata][planId]",
                plan.id
            );
        }

        form.set("success_url", successUrl);
        form.set("cancel_url", cancelUrl);

        /*
         * A session fetched without `expand` has no `line_items` key at
         * all, which would leave every entitlement recorded against no
         * price. Asking for the line items up front means the delivered
         * object carries the price id.
         */
        form.set("expand[0]", "line_items.data.price");

        const response = await fetch(
            `${STRIPE_API}/v1/checkout/sessions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${secretKey}`,
                    "Content-Type":
                        "application/x-www-form-urlencoded",
                },
                body: form.toString(),
            }
        );

        const payload = asRecord(
            await response.json().catch(() => ({}))
        );

        if (!response.ok) {
            const message = asRecord(payload.error).message;

            throw new Error(
                typeof message === "string"
                    ? message
                    : `Stripe rejected the checkout session (${response.status}).`
            );
        }

        const url = readString(payload, "url");
        const sessionId = readString(payload, "id");

        if (!url || !sessionId) {
            throw new Error(
                "Stripe returned a checkout session without a redirect URL."
            );
        }

        return {
            /*
             * Our own id is the provider's; there is no second store to
             * reconcile against, and inventing a local id here would be
             * a second identity for the same object.
             */
            id: sessionId,
            providerSessionId: sessionId,
            url,
        };
    },

    async verifyWebhook({
        body,
        signatureHeader,
    }): Promise<PaymentEvent[] | null> {
        const secret = (
            process.env.STRIPE_WEBHOOK_SECRET ?? ""
        ).trim();

        /*
         * Unconfigured means the endpoint is not wired up. Returning
         * null makes the route answer 401 rather than trusting the
         * body, which is the only safe reading of "nobody told us what
         * secret to expect".
         */
        if (!secret || !signatureHeader) {
            return null;
        }

        const valid = await verifySignature({
            body,
            header: signatureHeader,
            secret,
        });

        if (!valid) {
            return null;
        }

        let parsed: unknown;

        try {
            parsed = JSON.parse(body);
        } catch {
            return null;
        }

        return toPaymentEvents(parsed);
    },

    /*
     * Whether to offer the portal at all.
     *
     * A local database read, not a Stripe call: the portal is only ever
     * reachable for a customer this app already knows about, so asking
     * Stripe would add latency and a failure mode to a question the
     * database can already answer.
     */
    async hasBillingRecord({ discordId }) {
        return (await getStoredStripeCustomerId(discordId)) !== null;
    },

    /*
     * Opens Stripe's hosted customer portal.
     *
     * The stored customer id is the only thing this needs, and its
     * absence is the whole answer: Stripe's portal is a view onto one
     * customer's invoices, cards and subscriptions, so an account that
     * has never paid has nothing for the page to show. Returning null
     * lets the route say that plainly instead of sending the customer to
     * an error page at Stripe.
     */
    async createCustomerPortalSession({
        discordId,
        returnUrl,
    }): Promise<CustomerPortalSession | null> {
        const secretKey = required("STRIPE_SECRET_KEY");

        const customerId = await getStoredStripeCustomerId(discordId);

        if (!customerId) {
            return null;
        }

        const form = new URLSearchParams();

        form.set("customer", customerId);
        form.set("return_url", returnUrl);

        const response = await fetch(
            `${STRIPE_API}/v1/billing_portal/sessions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${secretKey}`,
                    "Content-Type":
                        "application/x-www-form-urlencoded",
                },
                body: form.toString(),
            }
        );

        const payload = asRecord(
            await response.json().catch(() => ({}))
        );

        if (!response.ok) {
            const message = asRecord(payload.error).message;

            throw new Error(
                typeof message === "string"
                    ? message
                    : `Stripe rejected the portal session (${response.status}).`
            );
        }

        const url = readString(payload, "url");
        const sessionId = readString(payload, "id");

        if (!url || !sessionId) {
            throw new Error(
                "Stripe returned a portal session without a redirect URL."
            );
        }

        return { id: sessionId, url };
    },
};

/**
 * Builds the Stripe-hosted return link.
 *
 * The session id is echoed back in the query string purely so the
 * success page can look the purchase up for display. It carries no
 * authority: the entitlement is granted by the webhook, never by this
 * redirect.
 *
 * The placeholder is concatenated rather than passed through
 * `searchParams.set`, because Stripe substitutes the literal text
 * `{CHECKOUT_SESSION_ID}` and would not match a percent-encoded brace.
 */
export function checkoutReturnUrl(
    origin: string,
    sessionId: string
): string {
    const base = origin.replace(/\/+$/, "");

    if (sessionId === "{CHECKOUT_SESSION_ID}") {
        return `${base}/dashboard/premium/billing?checkout=complete&session_id={CHECKOUT_SESSION_ID}`;
    }

    const url = new URL("/dashboard/premium/billing", base);

    url.searchParams.set("checkout", "complete");
    url.searchParams.set("session_id", sessionId);

    return url.toString();
}

/**
 * Exposed for the test suite: the raw decoder, so event mapping can be
 * exercised without a network call or a real signature.
 */
export const __testing = {
    toPaymentEvents,
    verifySignature,
};
