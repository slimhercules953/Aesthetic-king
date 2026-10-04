import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "../../../../lib/session";

import { resolveAppOrigin } from "../../../../lib/auth";

import {
    findPlanByCheckoutKey,
} from "../../../../lib/payments/catalog";

import { getPaymentProvider } from "../../../../lib/payments";

import { checkoutReturnUrl } from "../../../../lib/payments/stripe";

/*
 * Starts a hosted checkout for the signed-in account.
 *
 * Three rules this route exists to enforce:
 *
 * 1. Only a signed-in account can buy anything, and the account is the
 *    session's — never a form field. That is the only reason the webhook
 *    can later trust the id it reads back.
 * 2. The plan comes from our catalog by id. A browser cannot name a
 *    price, an amount, or a currency.
 * 3. Nothing here decides that anyone got Premium. The redirect back is
 *    a UX convenience; access arrives only with the signed webhook.
 */

export async function POST(request: NextRequest) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME);

    if (!cookie) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = await verifySessionToken(cookie.value);

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const provider = getPaymentProvider();

    if (!provider) {
        /*
         * 404 rather than 503: from the visitor's point of view this
         * store does not exist, and a 5xx would invite retries against
         * something that will never succeed.
         */
        return NextResponse.json(
            { error: "Checkout is not available on this deployment." },
            { status: 404 }
        );
    }

    const formData = await request.formData().catch(() => null);

    const rawPlan = formData?.get("plan");

    /*
     * Only the short checkout keys are accepted — "monthly" and "yearly"
     * — and they are resolved against the server-side catalog. Anything
     * else, including a stored plan id or a price id, is rejected, so the
     * most a visitor can ask for is one of the plans this deployment
     * actually sells.
     */
    const plan = findPlanByCheckoutKey(
        typeof rawPlan === "string" ? rawPlan : null
    );

    if (!plan) {
        return NextResponse.json(
            { error: "That plan is not available." },
            { status: 400 }
        );
    }

    let origin: string;

    try {
        origin = resolveAppOrigin(request.url);
    } catch {
        return NextResponse.json(
            { error: "The app origin is not configured." },
            { status: 500 }
        );
    }

    try {
        const checkout = await provider.createCheckoutSession({
            plan,
            discordId: session.discordId,

            /*
             * Stripe substitutes its own session id for this literal
             * placeholder in the success URL, so the billing page can
             * show "thanks for the payment" without us storing the
             * session locally. It carries no authority: the grant comes
             * from the webhook, never from this redirect.
             */
            successUrl: checkoutReturnUrl(origin, "{CHECKOUT_SESSION_ID}"),
            cancelUrl: `${origin}/dashboard/premium/billing?checkout=cancelled`,
        });

        return NextResponse.redirect(checkout.url, 303);
    } catch (error) {
        console.error("[billing] checkout session failed", error);

        /*
         * The provider's own message is logged but not forwarded: Stripe
         * error text can name internal objects and would only confuse a
         * customer who is trying to pay.
         */
        return NextResponse.json(
            { error: "Checkout could not be started. Please try again." },
            { status: 502 }
        );
    }
}
