import {
    constantTimeEquals,
} from "../auth";

import type {
    CheckoutSession,
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
 *    needs exactly two endpoints.
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
 * Turns one Stripe event into zero or more app events.
 *
 * Zero is the normal answer for most of Stripe's catalogue. An event we
 * do not understand is ignored rather than guessed at; the route logs
 * the type so a new one shows up in the logs instead of being applied
 * wrongly.
 */
function toPaymentEvents(event: unknown): PaymentEvent[] {
    const envelope = asRecord(event);
    const type = readString(envelope, "type") ?? "";
    const id = readString(envelope, "id");

    if (!id) {
        return [];
    }

    const data = asRecord(asRecord(envelope).data);
    const object = asRecord(data.object);

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

            const subscription = readString(
                object,
                "subscription"
            );

            return [
                {
                    id,
                    kind: "checkout_completed",
                    discordId:
                        discordIdFromSession(object),
                    planId: planIdFromSession(object),
                    skuId: priceIdFromSession(object),

                    /*
                     * A subscription's first period end comes from the
                     * subscription object; a one-time payment has no
                     * clock of its own and the catalog decides the
                     * window.
                     */
                    currentPeriodEnd: fromUnix(
                        readNumber(
                            object,
                            "current_period_end"
                        )
                    ),

                    externalEntitlementId: subscription,
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

            return [
                {
                    id,
                    kind: "subscription_renewed",
                    discordId:
                        discordIdFromSession(object),
                    planId: planIdFromSession(object),
                    skuId: readString(
                        asRecord(first.price),
                        "id"
                    ),
                    currentPeriodEnd: fromUnix(
                        readNumber(
                            object,
                            "period_end"
                        ) ??
                            readNumber(
                                object,
                                "current_period_end"
                            )
                    ),
                    externalEntitlementId: readString(
                        object,
                        "subscription"
                    ),
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
             * A refund names the checkout session that took the money,
             * which is the only way back to the entitlement a one-time
             * purchase created.
             */
            return [
                {
                    id,
                    kind: "refund_issued",
                    discordId:
                        discordIdFromSession(object),
                    planId: planIdFromSession(object),
                    skuId: null,
                    currentPeriodEnd: null,
                    externalEntitlementId: readString(
                        object,
                        "id"
                    ),
                    raw: event,
                },
            ];
        }

        default:
            return [];
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

        const form = new URLSearchParams();

        form.set("mode", plan.durationMonths ? "payment" : "subscription");
        form.set("line_items[0][price]", plan.providerPriceId);
        form.set("line_items[0][quantity]", "1");

        /*
         * Both of these are read back out of the verified webhook. They
         * are how a purchase becomes an entitlement for the right
         * account without the browser ever naming a recipient.
         */
        form.set("client_reference_id", discordId);
        form.set("metadata[discordId]", discordId);
        form.set("metadata[planId]", plan.id);

        form.set("success_url", successUrl);
        form.set("cancel_url", cancelUrl);

        /*
         * Lets a customer who pays with a wallet skip the email step and
         * keeps the return link working when they close the tab.
         */
        form.set("redirect_on_completion", "always");

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
