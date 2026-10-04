import type {
    MetadataRoute,
} from "next";

import {
    SITE_URL,
} from "../lib/site";

/**
 * Web app manifest, so a saved shortcut looks like the product instead of a
 * browser tab with a generic icon.
 *
 * `display: standalone` is deliberate: Studio is used like an app — people open
 * it, work, and leave — and the browser chrome adds nothing. `start_url` is the
 * landing page rather than `/dashboard` because the latter redirects anonymous
 * visitors, and a shortcut opened on a phone may be the first visit.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Aesthetic King Studio",
        short_name: "Aesthetic King",
        description:
            "Design Discord aesthetics, profile sets and palettes, then bring them into your server.",

        start_url: "/",
        scope: "/",

        display: "standalone",
        orientation: "any",

        /*
         * Matches the app background so the splash screen and the OS task switcher
         * do not flash white before the dark UI paints.
         */
        background_color: "#08080c",
        theme_color: "#08080c",

        icons: [
            {
                /*
                 * The SVG is the source of truth and scales to any size, but
                 * Android still wants explicit raster entries for a installable
                 * shortcut, so both are listed.
                 */
                src: "/icon.svg",
                sizes: "any",
                type: "image/svg+xml",
                purpose: "any",
            },
            {
                src: "/icon.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icon.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],

        ...(SITE_URL
            ? {
                id: SITE_URL,
            }
            : {}),
    };
}
