import {
    env,
} from "cloudflare:workers";

/**
 * Guards for the two routes that mint paid value (Premium
 * entitlements and Crowns).
 *
 * Both used to be gated on a single deployment variable, which meant
 * one stray `BILLING_DEV="true"` — a copied dev config, a preview
 * environment inheriting dev vars — turned every signed-in Discord
 * account into a premium subscriber with a Crown balance. The flag
 * also lived in Cloudflare bindings while the rest of the codebase
 * reads `process.env`, so operators setting it the usual way got the
 * opposite of what they intended.
 *
 * All three conditions must now hold:
 *   1. the explicit dev flag is set,
 *   2. the deployment is not marked production, and
 *   3. the signed-in account is on the operator allowlist.
 *
 * Flags are read from both bindings and `process.env` so either
 * convention works.
 */

function readSetting(name: string): string | undefined {
    const bindings =
        env as unknown as Record<
            string,
            string | undefined
        >;

    return (
        bindings[name] ??
        process.env[name]
    );
}

/**
 * NODE_ENV is unreliable under Workers, so production is the default
 * rather than the opt-in: anything that is not explicitly
 * "development" or "test" is treated as production and refuses to
 * mint value.
 */
function looksLikeProduction(): boolean {
    const mode =
        (
            readSetting("NODE_ENV") ?? ""
        )
            .trim()
            .toLowerCase();

    return (
        mode !== "development" &&
        mode !== "test"
    );
}

/**
 * An unset or empty allowlist denies everyone, so forgetting to
 * configure it fails closed.
 */
function isAllowedOperator(
    allowlistVar: string,
    discordId: string
): boolean {
    const entries =
        (
            readSetting(allowlistVar) ?? ""
        )
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);

    return entries.includes(
        discordId
    );
}

function devToolsEnabled(
    flagVar: string,
    allowlistVar: string,
    discordId: string | null | undefined
): boolean {
    if (
        readSetting(flagVar) !== "true" ||
        looksLikeProduction()
    ) {
        return false;
    }

    if (!discordId) {
        return false;
    }

    return isAllowedOperator(
        allowlistVar,
        discordId
    );
}

/**
 * Crown reward rules are not finalised, so nothing should hand out
 * Crowns automatically and the grant UI must stay hidden. Both the
 * page and its API route check this so the flag cannot be bypassed
 * by calling the endpoint directly.
 *
 * Enable with CROWN_DEV="true", NODE_ENV="development" and
 * DEV_CROWNS_DISCORD_IDS="<comma separated discord ids>".
 */
export function crownDevToolsEnabled(
    discordId?: string | null
): boolean {
    return devToolsEnabled(
        "CROWN_DEV",
        "DEV_CROWNS_DISCORD_IDS",
        discordId
    );
}

/**
 * No payment provider is connected yet, and the handoff is explicit
 * that billing must not be faked. The entitlement system is built to
 * stand on its own, so this flag exposes grant/revoke for testing it
 * independently of any provider.
 *
 * Enable with BILLING_DEV="true", NODE_ENV="development" and
 * DEV_BILLING_DISCORD_IDS="<comma separated discord ids>".
 */
export function billingDevToolsEnabled(
    discordId?: string | null
): boolean {
    return devToolsEnabled(
        "BILLING_DEV",
        "DEV_BILLING_DISCORD_IDS",
        discordId
    );
}
