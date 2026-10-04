/**
 * Client-safe creator identity helpers.
 *
 * This lives apart from `creator.ts` because that module talks to the
 * database, and `FeedCard` is a client component — importing the ID helper
 * from there would drag `pg` into the browser bundle. Anything in this file
 * must stay dependency-free.
 */

export const CREATOR_PROFILE_BASE =
    "/dashboard/u";

/**
 * Discord IDs are snowflakes: digits only, and never the empty string.
 * Returns the trimmed ID, or null for anything that cannot be one — which
 * callers should treat as "no such creator" rather than passing it to SQL.
 *
 * The lower bound of 5 rejects obvious junk ("1", "1234") without trying to
 * be a precise snowflake range; snowflakes grow with time, so an upper bound
 * on the digit count would eventually reject valid IDs.
 */
export function normalizeDiscordId(
    value: string | null | undefined
): string | null {
    const trimmed =
        (value ?? "")
            .trim();

    return /^\d{5,25}$/.test(trimmed)
        ? trimmed
        : null;
}

/**
 * The profile page for a Discord ID, or null when the ID cannot be one.
 * Returning null rather than a broken href is what stops a malformed author
 * ID from rendering a link to a page that 404s.
 */
export function creatorProfileHref(
    discordId: string | null | undefined
): string | null {
    const normalized =
        normalizeDiscordId(discordId);

    return normalized
        ? `${CREATOR_PROFILE_BASE}/${normalized}`
        : null;
}
