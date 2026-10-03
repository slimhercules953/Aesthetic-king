import {
    grantEntitlement,
    hasEntitlement,
} from "./entitlements";

/**
 * Accounts that keep Premium without ever buying it.
 *
 * The obvious shortcut would be to treat these ids as Premium at the
 * point of the check. That would be a second source of truth for the
 * plan, and `featureAccess.ts` deliberately derives the plan from the
 * entitlement table alone — a claim in the session cookie can be
 * forged, and a hardcoded branch would quietly disagree with whatever
 * the billing page shows.
 *
 * So this writes a real entitlement row instead. Everything that
 * reads the plan sees it, the billing page shows where it came from,
 * and revoking it is the same operation as revoking a purchase.
 *
 * The grant is re-asserted on login rather than run once, because the
 * user row has to exist before an entitlement can point at it, and
 * this environment has no way to run one-off SQL against the
 * database. `externalEntitlementId` makes the write idempotent, so
 * logging in a hundred times leaves exactly one row.
 */

/**
 * Built-in ids that are always grandfathered. Additional ids can be
 * supplied with GRANDFATHER_IDS without redeploying.
 */
const BUILTIN_GRANDFATHER_IDS = new Set([
    // Studio developer.
    "567386567300087821",
]);

function grandfatherIds(): Set<string> {
    const configured =
        (
            process.env
                .GRANDFATHER_IDS ?? ""
        )
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);

    return new Set([
        ...BUILTIN_GRANDFATHER_IDS,
        ...configured,
    ]);
}

export function isGrandfathered(
    discordId: string
): boolean {
    return grandfatherIds().has(
        discordId
    );
}

/**
 * Makes sure a grandfathered account actually holds Premium.
 *
 * Skipped when any Premium is already active. `grantEntitlement`
 * supersedes the existing row of the same type, so re-asserting
 * unconditionally would overwrite a real subscription the account
 * later bought — and with no end date, which reads as a refund the
 * user never got. If that subscription expires, the next login
 * restores the grandfathered access.
 *
 * Never throws. Premium access is a courtesy for staff; it must not
 * be able to break someone's ability to sign in if the write fails.
 */
export async function ensureGrandfatheredEntitlement(
    discordId: string
): Promise<void> {
    if (!isGrandfathered(discordId)) {
        return;
    }

    try {
        if (
            await hasEntitlement(
                discordId,
                "PREMIUM"
            )
        ) {
            return;
        }

        await grantEntitlement(
            discordId,
            {
                type: "PREMIUM",

                source: "grandfather",

                startsAt: new Date(),

                // null endsAt means permanent.
                endsAt: null,

                externalEntitlementId:
                    `grandfather:${discordId}`,
            }
        );
    } catch (error) {
        console.error(
            "Failed to apply grandfathered Premium for",
            discordId,
            error
        );
    }
}
