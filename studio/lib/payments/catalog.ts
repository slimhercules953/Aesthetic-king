import type { SellablePlan } from "./types";

/**
 * What the app is willing to sell, and which provider price each option
 * maps to.
 *
 * The plan list lives here rather than in the provider so that the
 * billing page, the checkout route and the webhook all agree on what a
 * plan id means. The provider only ever sees `providerPriceId`.
 *
 * A plan whose price id is not configured is omitted rather than
 * rendered broken: a deployment that has created only the monthly price
 * should show one button, not three of which two fail on click.
 */

const DISCORD_ID_PATTERN = /^\d{17,20}$/;

function readEnv(name: string): string {
    return (process.env[name] ?? "").trim();
}

/**
 * Cosmetic price text.
 *
 * Only ever rendered, never charged. The amount a card is actually
 * billed comes from the provider's price object, so a stale value here
 * is a display bug rather than an overcharge.
 */
function displayPrice(
    amountVar: string,
    fallback: string
): string {
    const amount = readEnv(amountVar);

    return amount || fallback;
}

type CatalogEntry = {
    id: string;
    entitlementType: SellablePlan["entitlementType"];
    name: string;
    durationMonths: number | null;
    checkoutKey: string | null;
    priceVar: string;
    fallbackPrice: string;
    blurb: string;
    priceIdVar: string;
};

/**
 * Order matters: this is the order the billing page renders.
 */
const CATALOG: CatalogEntry[] = [
    {
        id: "premium-monthly",
        entitlementType: "PREMIUM",
        name: "Premium monthly",
        durationMonths: null,
        checkoutKey: "monthly",

        priceVar: "PREMIUM_MONTHLY_DISPLAY_PRICE",
        fallbackPrice: "$5 / month",

        blurb:
            "Renews every month until you cancel. Cancel any time and Premium runs to the end of the period you already paid for.",

        priceIdVar: "PREMIUM_MONTHLY_PRICE_ID",
    },
    {
        id: "premium-quarter",
        entitlementType: "PREMIUM",
        name: "Premium 3 months",
        durationMonths: 3,
        checkoutKey: null,

        priceVar: "PREMIUM_QUARTER_DISPLAY_PRICE",
        fallbackPrice: "$12.99 once",

        blurb:
            "One payment, three months of Premium, no renewal. Nothing is charged again automatically.",

        priceIdVar: "PREMIUM_QUARTER_PRICE_ID",
    },
    {
        id: "premium-annual",
        entitlementType: "PREMIUM",
        name: "Premium yearly",
        durationMonths: null,
        checkoutKey: "yearly",

        priceVar: "PREMIUM_ANNUAL_DISPLAY_PRICE",
        fallbackPrice: "$49.99 / year",

        blurb:
            "Renews every year until you cancel. Cancel any time and Premium runs to the end of the year you already paid for.",

        priceIdVar: "PREMIUM_ANNUAL_PRICE_ID",
    },
];

/**
 * Every plan this deployment can actually sell.
 *
 * Plans with no configured price id are left out, so an unconfigured
 * deployment gets an empty list and the billing page says checkout is
 * not available instead of offering a button that errors.
 */
export function getSellablePlans(): SellablePlan[] {
    return CATALOG.flatMap((entry) => {
        const providerPriceId = readEnv(entry.priceIdVar);

        if (!providerPriceId) {
            return [];
        }

        return [
            {
                id: entry.id,
                entitlementType: entry.entitlementType,
                name: entry.name,
                durationMonths: entry.durationMonths,
                checkoutKey: entry.checkoutKey,
                displayPrice: displayPrice(
                    entry.priceVar,
                    entry.fallbackPrice
                ),
                blurb: entry.blurb,
                providerPriceId,
            },
        ];
    });
}

/**
 * Resolves a stored plan id, e.g. the one carried in provider metadata.
 *
 * Returns null for an unknown id or one that is not configured here, so
 * a hand-crafted checkout request cannot name an arbitrary price.
 */
export function findSellablePlan(
    planId: string | null | undefined
): SellablePlan | null {
    const wanted = (planId ?? "").trim();

    if (!wanted) {
        return null;
    }

    return (
        getSellablePlans().find(
            (plan) => plan.id === wanted
        ) ?? null
    );
}

/**
 * Resolves the value a checkout form submitted into a real plan.
 *
 * This is the only way the browser can pick a plan. It accepts the short
 * wire values ("monthly", "yearly") and nothing else — not the stored
 * plan id, not a price id, not an amount — so the set of things a
 * visitor may ask for is exactly the set of plans this deployment sells.
 * The lookup is case- and whitespace-insensitive because a hand-built
 * form should fail for the wrong *plan*, not for a stray space.
 */
export function findPlanByCheckoutKey(
    value: string | null | undefined
): SellablePlan | null {
    const wanted = (value ?? "").trim().toLowerCase();

    if (!wanted) {
        return null;
    }

    return (
        getSellablePlans().find(
            (plan) => plan.checkoutKey === wanted
        ) ?? null
    );
}

/**
 * Adds months, clamped to the end of the target month.
 *
 * `setUTCMonth` overflows instead of clamping: adding one month to
 * Jan 31 yields Mar 3, because February has no 31st. For a purchase
 * that means a quarter bought on the 31st would silently be two months
 * and three days, so the day is pulled back to the last day that month
 * actually has.
 */
export function addMonths(
    from: Date,
    months: number
): Date {
    const day = from.getUTCDate();

    const end = new Date(from.getTime());

    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + months);

    /*
     * Day 0 of a month is the last day of the previous one, which is how
     * the length of the target month is read without a lookup table.
     * Built with Date.UTC so the answer cannot depend on the runtime's
     * local timezone.
     */
    const lastDay = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)
    ).getUTCDate();

    end.setUTCDate(Math.min(day, lastDay));

    return end;
}

/**
 * Rejects anything that is not shaped like a Discord snowflake.
 *
 * The id is written into the checkout session and later trusted in the
 * webhook, so validating it at the door keeps a malformed session from
 * ever becoming a grant.
 */
export function isDiscordId(
    value: unknown
): value is string {
    return (
        typeof value === "string" &&
        DISCORD_ID_PATTERN.test(value.trim())
    );
}
