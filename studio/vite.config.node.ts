import vinext from "vinext";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

/*
 * Node/VPS build.
 *
 * The Cloudflare config (`vite.config.cloudflare.ts`) is the one used for
 * `npm run dev` and for Workers deploys. This one exists so the Studio can
 * also run as an ordinary Node process behind a reverse proxy, which is what
 * a self-hosted VM needs.
 *
 * Three Cloudflare-only integrations are dropped, and each has a Node
 * equivalent wired up in the modules that used them:
 *
 *   - `responseStoreAdapter()`  -> vinext's default in-process cache
 *   - `imagesOptimizer()`       -> vinext's default local image optimisation
 *   - the `cloudflare()` plugin -> nothing; the RSC/SSR build is plain Node
 *
 * `server` still matters here: `vinext dev` reads it, and the built server
 * takes its port from `PORT` rather than from this file.
 */
export default defineConfig({
    server: {
        // Bind every interface so the reverse proxy on the same host can
        // reach it and so other devices on the LAN can still connect.
        host: true,
        port: 3000,
        allowedHosts: [".etterdigital.dev", ".local", ".lan"],
    },
    resolve: {
        // `cloudflare:workers` is a workerd built-in; there is nothing for
        // Rolldown to resolve on Node and the build fails outright rather
        // than warning. The shim in `lib/nodeWorkersShim.ts` answers the
        // same named imports from `process.env`.
        alias: {
            "cloudflare:workers": fileURLToPath(
                new URL("./lib/nodeWorkersShim.ts", import.meta.url),
            ),
        },
    },
    plugins: [vinext()],
});
