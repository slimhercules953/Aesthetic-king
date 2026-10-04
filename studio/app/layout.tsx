import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
