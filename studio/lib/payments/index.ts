import type { PaymentProvider } from "./types";

import { stripeProvider } from "./stripe";

/*
 * The single entry point the rest of the app uses to reach a payment
 * provider.
 *
 * Returning null (rather than throwing) when nothing is configured is
 * the whole design: an unprovisioned deployment is a normal state, not
 * an error. The billing page then says checkout is unavailable and the
 * webhook route answers 404, instead of a half-configured store
 * pretending to take money.
 */

const PROVIDERS: Record<string, PaymentProvider> = {
    stripe: stripeProvider,
};

function configuredName(): string {
    return (process.env.PAYMENT_PROVIDER ?? "stripe").trim().toLowerCase();
}

/**
 * True when this deployment can actually take money.
 *
 * Checks both the selector and the credentials, because a name alone is
 * not enough to promise a checkout button: `PAYMENT_PROVIDER=stripe`
 * without a secret key would offer a button that always fails.
 */
export function isPaymentProviderConfigured(): boolean {
    const provider = PROVIDERS[configuredName()];

    if (!provider) {
        return false;
    }

    if (provider.name === "stripe") {
        const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
        const priceConfigured = [
            "PREMIUM_MONTHLY_PRICE_ID",
            "PREMIUM_QUARTER_PRICE_ID",
            "PREMIUM_ANNUAL_PRICE_ID",
        ].some((name) => (process.env[name] ?? "").trim().length > 0);

        return key.startsWith("sk_") && priceConfigured;
    }

    return true;
}

/**
 * The provider to use, or null when checkout is not available here.
 */
export function getPaymentProvider(): PaymentProvider | null {
    const name = configuredName();
    const provider = PROVIDERS[name];

    if (!provider) {
        console.warn(
            `[payments] unknown PAYMENT_PROVIDER "${name}"; checkout disabled`
        );

        return null;
    }

    if (!isPaymentProviderConfigured()) {
        return null;
    }

    return provider;
}

export type {
    CheckoutSession,
    CustomerPortalSession,
    PaymentEvent,
    PaymentEventKind,
    PaymentProvider,
    SellablePlan,
} from "./types";

export {
    findSellablePlan,
    getSellablePlans,
} from "./catalog";
