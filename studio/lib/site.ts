/**
 * The deployment's public origin, without a trailing slash.
 *
 * Metadata routes (`sitemap.ts`, `opengraph-image.tsx`) need absolute URLs, and
 * a route handler has no reliable way to derive the host it was reached on
 * behind Cloudflare's proxy, a custom domain and a preview deployment at the
 * same time. So the operator states it.
 *
 * Returns null when unset rather than defaulting to `localhost`, which would
 * otherwise leak a development host into a production sitemap. Callers must
 * handle the null case by omitting the absolute URL.
 */
export const SITE_URL: string | null =
    (
        process.env
            .NEXT_PUBLIC_SITE_URL ??
        process.env
            .SITE_URL ??
        ""
    )
        .trim()
        .replace(/\/+$/, "") ||
    null;

/**
 * Absolute URL for a path, or null when no origin is configured.
 */
export function absoluteUrl(
    path: string
): string | null {
    if (!SITE_URL) {
        return null;
    }

    return path.startsWith("/")
        ? `${SITE_URL}${path}`
        : `${SITE_URL}/${path}`;
}
