import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { responseStoreAdapter } from "@vinext/cloudflare/cache/response-store-adapter";
import { imagesOptimizer } from "@vinext/cloudflare/images/images-optimizer";

export default defineConfig({
  server: {
    // Bind every interface so other devices on the LAN can reach the
    // dev server at http://<this machine's IP>:3000.
    host: true,
    port: 3000,
    // Vite blocks requests whose Host header isn't recognised, to stop
    // DNS-rebinding attacks. Bare IPv4 addresses are always allowed, so
    // this only needs to cover access by machine name.
    allowedHosts: ["KILLER", ".local", ".lan"],
  },
  plugins: [
    vinext({
      cache: responseStoreAdapter(),
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
