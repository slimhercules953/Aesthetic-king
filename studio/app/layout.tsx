import type { Metadata } from "next";
import "./globals.css";

import { SITE_URL } from "../lib/site";

export const metadata: Metadata = {
  /*
   * Without a base, generated absolute URLs (og:image, canonical) fall back to
   * the framework default of `http://localhost:3000`, which is wrong on every
   * real deployment. `lib/site.ts` returns null when unset, so the field is
   * simply omitted in that case rather than pointing somewhere false.
   */
  ...(SITE_URL
    ? {
        metadataBase: new URL(SITE_URL),
      }
    : {}),
  title: {
    default: "Aesthetic King Studio",
    template: "%s | Aesthetic King Studio",
  },
  description:
    "Design Discord aesthetics, profile sets and palettes with Aesthetic King, then bring them into your server.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
