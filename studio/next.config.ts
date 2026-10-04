import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Creator profiles moved from `/dashboard/u/[discordId]` to `/u/[discordId]`.
   *
   * This has to be a config redirect rather than a `redirect()` inside the old
   * page: `app/dashboard/layout.tsx` sends anonymous visitors to `/`, and a
   * profile link pasted into Discord is usually opened by someone who has not
   * signed in. Layouts run before the page, so a page-level redirect would only
   * ever be reached by signed-in users. Config redirects are evaluated in the
   * request pipeline, ahead of any layout.
   */
  async redirects() {
    return [
      {
        source: "/dashboard/u/:discordId",
        destination: "/u/:discordId",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
