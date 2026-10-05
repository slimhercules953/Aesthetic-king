import vinext from "vinext";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { responseStoreAdapter } from "@vinext/cloudflare/cache/response-store-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

/*
 * Cloudflare Workers build — the default, and what `npm run dev` uses.
 *
 * `vite.config.node.ts` sits next to this file and builds the same app as an
 * ordinary Node process for a self-hosted VPS behind a reverse proxy. It
 * drops the three Cloudflare-only integrations used here:
 *
 *   - `responseStoreAdapter()`  -> vinext's default in-process cache
 *   - `imagesOptimizer()`       -> vinext's default local image optimisation
 *   - the `cloudflare()` plugin -> nothing; the RSC/SSR build is plain Node
 *
 * It also swaps `cloudflare:workers` for `lib/nodeWorkersShim.ts`, which
 * answers the same bindings from `process.env`.
 */
export default defineConfig({
    server: {
        host: true,
        port: 3000,
        allowedHosts: [".etterdigital.dev", ".local", ".lan"],
    },
    plugins: [
        vinext({
            cache: responseStoreAdapter(),
            images: { optimizer: imagesOptimizer() },
        }),
        cloudflare({
            // Named `wrangler.cloudflare.jsonc` rather than `wrangler.jsonc`
            // on purpose. vinext decides the target platform partly by
            // looking for a default-named Wrangler manifest in the project
            // root, and refuses to build a Node bundle when it finds one.
            // Renaming it (and pointing this plugin at it explicitly) is what
            // lets `vite.config.node.ts` build the same app for a VPS without
            // deleting the Workers deployment config.
            configPath: "wrangler.cloudflare.jsonc",
            viteEnvironment: {
                name: "rsc",
                childEnvironments: ["ssr"],
            },
        }),
    ],
});
