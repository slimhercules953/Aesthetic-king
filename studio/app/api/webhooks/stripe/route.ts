import { NextRequest, NextResponse } from "next/server";

import { getPaymentProvider } from "../../../../lib/payments";

import { applyPaymentEvents } from "../../../../lib/payments/applyPaymentEvent";

/*
 * Receives payment provider webhooks.
 *
 * This endpoint is the only thing that grants paid access, so the order
 * of operations here is the security model:
 *
 *   1. read the body as raw text (a signature covers exact bytes)
 *   2. verify the signature
 *   3. only then parse and apply
 *
 * Anything that parses the JSON before step 2 has already acted on
 * unauthenticated input, even if it "fails safely" later.
 */

/**
 * Stripe retries for up to three days on any non-2xx response.
 *
 * So every response below is chosen for what it tells the provider:
 * 401/404 for "stop sending this", 200 for "handled or deliberately
 * ignored", and 500 only when a retry could genuinely succeed.
 */
export async function POST(request: NextRequest) {
    const provider = getPaymentProvider();

    const webhookSecretConfigured = Boolean(
        (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim()
    );

    if (!provider || !webhookSecretConfigured) {
        /*
         * 404, matching the top.gg webhook: an unprovisioned deploy is
         * not broken, and a 5xx here would make Stripe treat a
         * misconfiguration as a transient fault and retry forever.
         */
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.text();

    const signature = request.headers.get("stripe-signature");

    let events;

    try {
        events = await provider.verifyWebhook({
            body,
            signatureHeader: signature,
        });
    } catch (error) {
        console.error("[webhooks:stripe] verification errored", error);

        return NextResponse.json(
            { error: "Webhook verification failed." },
            { status: 401 }
        );
    }

    if (!events) {
        console.warn("[webhooks:stripe] rejected an unsigned or tampered payload");

        return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }

    if (events.length === 0) {
        /*
         * A validly signed event we do not act on. Answering 200 keeps
         * the endpoint healthy in the provider dashboard while leaving
         * the type visible in the log, which is how a new event Stripe
         * starts sending gets noticed instead of silently dropped.
         */
        console.log("[webhooks:stripe] ignored an event with no action");

        return NextResponse.json({ ok: true, ignored: true });
    }

    let outcomes;

    try {
        outcomes = await applyPaymentEvents(provider.name, events);
    } catch (error) {
        /*
         * The database was unreachable. Retrying is the right answer,
         * and it is safe: applied events were already claimed, so a
         * redelivery is recognised as a duplicate rather than granted
         * twice.
         */
        console.error("[webhooks:stripe] applying events failed", error);

        return NextResponse.json({ error: "Processing failed." }, { status: 500 });
    }

    for (const outcome of outcomes) {
        if (outcome.status === "ignored") {
            console.warn(
                `[webhooks:stripe] ignored ${outcome.eventId}: ${outcome.reason}`
            );
        } else if (outcome.status === "failed") {
            console.error(
                `[webhooks:stripe] failed ${outcome.eventId}: ${outcome.reason}`
            );
        }
    }

    /*
     * A failed outcome is still answered with 200 when it was a business
     * rejection (unknown plan, unknown user), because retrying those
     * cannot succeed. Only a database failure above returns 5xx.
     */
    return NextResponse.json({
        ok: true,
        applied: outcomes.filter((outcome) => outcome.status === "applied").length,
        duplicates: outcomes.filter((outcome) => outcome.status === "duplicate").length,
        ignored: outcomes.filter((outcome) => outcome.status === "ignored").length,
        failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    });
}
