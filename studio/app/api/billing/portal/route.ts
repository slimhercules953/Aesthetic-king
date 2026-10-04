import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifySessionToken } from "../../../../lib/session";

import { resolveAppOrigin } from "../../../../lib/auth";

import { getPaymentProvider } from "../../../../lib/payments";

/*
 * Sends the signed-in account to the payment provider's own customer
 * portal, where they can cancel a subscription, change a card or
 * download invoices.
 *
 * The reason this is a redirect rather than a screen of our own is
 * authority. Cancelling a subscription is a destructive action against a
 * billing record, and the only safe way to expose it is to let the
 * provider authenticate the customer and render the controls itself.
 * Nothing in this route can choose what gets cancelled: the browser
 * sends no identifiers at all, and the account comes from the session
 * cookie.
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

    if (!provider?.createCustomerPortalSession) {
        /*
         * Either no provider is configured, or the configured one has no
         * portal. 404 matches the checkout route: from the visitor's
         * point of view this feature does not exist here.
         */
        return NextResponse.json(
            {
                error:
                    "A billing portal is not available on this deployment.",
            },
            { status: 404 }
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
        const portal = await provider.createCustomerPortalSession({
            discordId: session.discordId,

            /*
             * The portal sends people back here. The query flag only
             * selects a banner; it grants nothing, and any change made
             * in the portal reaches the entitlement through the webhook
             * as usual.
             */
            returnUrl: `${origin}/dashboard/premium/billing?portal=returned`,
        });

        if (!portal) {
            /*
             * No customer record, so there is nothing to manage. This is
             * not a failure and not a secret: the account simply has no
             * billing history at the provider yet.
             */
            return NextResponse.json(
                {
                    error:
                        "This account has no subscription to manage yet. Buy a plan first.",
                },
                { status: 404 }
            );
        }

        return NextResponse.redirect(portal.url, 303);
    } catch (error) {
        console.error("[billing] portal session failed", error);

        /*
         * Stripe's error text can name internal objects — and, if the
         * portal has not been switched on in the dashboard, says exactly
         * that — so it is logged rather than shown.
         */
        return NextResponse.json(
            {
                error:
                    "The billing portal could not be opened. Please try again.",
            },
            { status: 502 }
        );
    }
}
