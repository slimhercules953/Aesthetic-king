import type {
    MetadataRoute,
} from "next";

import {
    SITE_URL,
} from "../lib/site";

/**
 * Crawl rules for the public site.
 *
 * The dashboard is behind a session cookie and every page under it is marked
 * `noindex` in `lib/pageMetadata.ts`; disallowing the path here is the belt to
 * that braces. A crawler that reaches `/dashboard` only records a redirect to
 * `/`, which is worse for the landing page's ranking than never arriving.
 *
 * `/api` is disallowed because the routes are not pages — crawling them spends
 * budget and, for anything reading a session cookie, returns a redirect that
 * looks like a soft 404.
 *
 * `/u/*` is deliberately left open: creator profiles are the pages worth
 * appearing in search results.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: "*",
                allow: "/",
                disallow: [
                    "/dashboard",
                    "/api",
                ],
            },
        ],

        /*
         * Only emitted when a canonical origin is configured. A relative
         * sitemap URL is not valid robots.txt, and guessing a host here would
         * point crawlers at the wrong deployment.
         */
        ...(SITE_URL
            ? {
                sitemap: `${SITE_URL}/sitemap.xml`,
            }
            : {}),
    };
}
