import type {
    MetadataRoute,
} from "next";

import {
    SITE_URL,
} from "../lib/site";

import {
    creatorProfileHref,
} from "../lib/creatorHref";

import {
    listPublishedCreatorDiscordIds,
} from "../lib/creator";

/**
 * The indexable surface of the site is exactly two things: the landing page and
 * the creator profiles under `/u/*`. Everything under `/dashboard` is behind a
 * session cookie and marked `noindex`, so listing it here would contradict the
 * robots directives rather than support them.
 *
 * When no origin is configured the whole thing is skipped. A sitemap of relative
 * URLs is invalid, and emitting one that lists nothing is better than one that
 * lists `http://localhost/...` from a production deployment.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    if (!SITE_URL) {
        return [];
    }

    const entries: MetadataRoute.Sitemap = [
        {
            url: `${SITE_URL}/`,
            changeFrequency: "weekly",
            priority: 1,
        },
    ];

    /*
     * A broken database must not take the whole sitemap down with it — an empty
     * creator list still leaves a valid file containing the landing page.
     */
    try {
        const creators =
            await listPublishedCreatorDiscordIds();

        for (const creator of creators) {
            const href = creatorProfileHref(
                creator.discordId
            );

            if (!href) {
                continue;
            }

            entries.push({
                url: `${SITE_URL}${href}`,
                /*
                 * The last publish is the only real change signal we keep, and
                 * it is honest: a profile's content is a projection of its
                 * posts, so nothing on the page changed since then.
                 */
                lastModified:
                    creator.lastPostAt,
                changeFrequency: "daily",
                /*
                 * Below the landing page but above nothing: these are the pages
                 * that can actually rank, since they are the only ones with
                 * unique content.
                 */
                priority: 0.7,
            });
        }
    } catch (error) {
        console.error(
            "[studio] sitemap: creator lookup failed",
            error
        );
    }

    return entries;
}
