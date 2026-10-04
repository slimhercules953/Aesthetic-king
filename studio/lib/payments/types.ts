/**
 * The vocabulary of checkout, independent of any payment provider.
 *
 * Nothing in the app is allowed to talk to Stripe (or Discord's store,
 * or a tax provider) directly. They build one of these, hand it to the
 * provider returned by `getPaymentProvider()`, and read one of these
 * back out of a webhook. That indirection is the only reason swapping
 * or adding a provider is a new file rather than a rewrite of the
 * billing page.
 */

/**
 * A plan we are willing to sell, as the app sees it.
 *
 * `id` is ours and stable; `providerPriceId` is the provider's and is
 * configuration. Keeping both here means a price change in the provider
 * dashboard cannot silently change what our buttons mean.
 */
export type SellablePlan = {
    /**
     * Stable identifier carried through checkout. Never reused for a
     * different product, because it ends up in entitlement rows.
     */
    id: string;

    /** Entitlement the purchase grants. */
    entitlementType: "PREMIUM" | "SERVER_PREMIUM";

    name: string;

    /**
     * How long one purchase lasts. Null means the provider owns the
     * clock (a true subscription) and every renewal extends the period.
     */
    durationMonths: number | null;

    /**
     * The value the dashboard form sends when a buyer picks this plan.
     *
     * Kept separate from `id` on purpose. `id` is a stored identifier:
     * it is already written into entitlement rows and Stripe metadata, so
     * renaming it would quietly orphan existing data. A form field carries
     * no such history, so it can stay short and obvious ("monthly",
     * "yearly") without dragging the stored id along with it.
     *
     * Null means the plan is not offered for self-service checkout.
     */
    checkoutKey: string | null;

    /**
     * Display price in whole major units with the currency. This is
     * cosmetic; the charged amount always comes from the provider's own
     * price object, never from anything the browser sends.
     */
    displayPrice: string;

    blurb: string;

    /** Provider-specific price identifier, from configuration. */
    providerPriceId: string;
};

/**
 * A hosted checkout page we have asked the provider to create.
 *
 * The app redirects to `url`; it never collects card data itself, which
 * is what keeps the app out of PCI scope entirely.
 */
export type CheckoutSession = {
    /** Our id for the session, kept for logging and reconciliation. */
    id: string;

    /** The provider's own id for the same session. */
    providerSessionId: string;

    url: string;
};

/**
 * The subset of provider events the app acts on.
 *
 * Providers send far more than this. Anything not listed here is
 * deliberately ignored rather than guessed at; an unhandled event must
 * be visible in the logs, not misapplied.
 */
export type PaymentEventKind =
    /** Payment finished; grant the entitlement. */
    | "checkout_completed"

    /** A subscription period was paid for again; extend it. */
    | "subscription_renewed"

    /** Cancelled; stop future grants. */
    | "subscription_canceled"

    /** Money went back; end the entitlement it bought. */
    | "refund_issued";

/**
 * One verified provider event, already decoded.
 *
 * `externalEntitlementId` is the provider's id for the thing the user
 * *has* (a subscription, a purchase), which is what the Entitlement
 * table stores so a later refund can revoke exactly that grant.
 *
 * `discordId` is the account the purchase was made for. It is trusted
 * only because this app wrote it into the checkout session and the
 * provider signed it back to us; never from a form field.
 */
export type PaymentEvent = {
    /**
     * The provider's unique event id. Recorded on delivery so a retry
     * is recognized as a replay instead of a second purchase.
     */
    id: string;

    kind: PaymentEventKind;

    discordId: string | null;

    planId: string | null;

    skuId: string | null;

    externalEntitlementId: string | null;

    /**
     * End of the paid period, when the provider knows it. For a renewal
     * this is the new expiry; for a cancellation it is when access ends.
     */
    currentPeriodEnd: Date | null;

    /** Raw provider payload, kept for support and debugging. */
    raw: unknown;
};

/**
 * What a provider implementation must do.
 *
 * Deliberately two methods. A customer portal, refunds and payouts are
 * all things a provider may offer, but the app has no need for them
 * yet, and an interface with speculative methods guarantees the second
 * provider implements things nobody calls.
 */
export type PaymentProvider = {
    /** Stable short name, stored in `source` on granted entitlements. */
    readonly name: string;

    /**
     * Creates a hosted checkout page for one plan, bound to one
     * account. `discordId` is embedded in the session so the webhook
     * can attribute the purchase without trusting the browser.
     */
    createCheckoutSession(input: {
        plan: SellablePlan;
        discordId: string;
        successUrl: string;
        cancelUrl: string;
    }): Promise<CheckoutSession>;

    /**
     * Verifies the signature on a webhook body and decodes it.
     *
     * Must return null for anything that does not carry a valid
     * signature for this exact body. A provider that cannot be
     * configured must not be reachable at all, so throwing here means
     * "reject with 401", never "assume it was fine".
     */
    verifyWebhook(input: {
        body: string;
        signatureHeader: string | null;
    }): Promise<PaymentEvent[] | null>;
};
