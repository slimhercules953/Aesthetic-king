import {
    cookies,
} from "next/headers";

import {
    redirect,
} from "next/navigation";

import {
    Crown,
    FolderHeart,
    Images,
    Palette,
    Server,
    Sparkles,
    UserRoundCog,
} from "lucide-react";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../lib/session";

import type {
    Metadata,
} from "next";

/*
 * This is the only marketing page, so it is the only one worth indexing. The
 * signed-in app is `noindex` via `lib/pageMetadata.ts`; creator profiles opt in
 * themselves. Everything else inherits this.
 */
export const metadata: Metadata = {
    /*
     * `absolute` opts out of the root layout's `%s | Aesthetic King Studio`
     * template — the landing page is the brand, it shouldn't suffix itself.
     */
    title: {
        absolute: "Aesthetic King Studio",
    },
    description:
        "Aesthetic King designs the banner, avatar, colors, bio and status for a complete Discord look. Build palettes and profile sets in the browser, save what you like, and run the same generator for your whole server.",
    keywords: [
        "Discord aesthetics",
        "Discord profile",
        "Discord banner",
        "color palette generator",
        "Discord bot",
    ],
    alternates: {
        canonical: "/",
    },
    openGraph: {
        title: "Aesthetic King Studio",
        description:
            "Build a complete Discord look — banner, avatar, colors, bio and status — then bring it to your server.",
        type: "website",
        url: "/",
        siteName: "Aesthetic King",
    },
    twitter: {
        card: "summary_large_image",
        title: "Aesthetic King Studio",
        description:
            "Build a complete Discord look, then bring it to your server.",
    },
    robots: "index, follow",
};

const features = [    {
        icon: Sparkles,
        title: "Aesthetic generator",
        body: "Pick an aesthetic and a mood, and Aesthetic King builds a matching Discord profile with colors, bio, status and symbols.",
    },
    {
        icon: Palette,
        title: "Palette studio",
        body: "Build reusable three to six color palettes, or pull the colors straight out of any image you upload.",
    },
    {
        icon: UserRoundCog,
        title: "Profile builder",
        body: "Compose banner, avatar, colors and bio together and watch the Discord profile update as you change it.",
    },
    {
        icon: Images,
        title: "Asset explorer",
        body: "Every banner, avatar and profile set you have saved, searchable by tag, color and sort order.",
    },
    {
        icon: FolderHeart,
        title: "Collections and Discover",
        body: "Group looks into collections, then share the ones you like to the community feed.",
    },
    {
        icon: Server,
        title: "Server Studio",
        body: "Point generation at a channel, manage slash commands, curate aesthetic packs and review usage analytics.",
    },
];

export default async function LandingPage() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

    if (sessionCookie) {
        const session = await verifySessionToken(sessionCookie.value);
        if (session) {
            redirect("/dashboard");
        }
    }

    return (
        <main className="min-h-screen bg-[#08080c] text-white">
            <div className="pointer-events-none fixed inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.16),transparent_65%)]" />

            <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
                        <Crown
                            size={20}
                            strokeWidth={2.2}
                        />
                    </div>

                    <div>
                        <p className="font-semibold tracking-tight">
                            Aesthetic King
                        </p>

                        <p className="text-xs text-zinc-500">
                            Studio
                        </p>
                    </div>
                </div>

                <a
                    href="/api/auth/discord"
                    className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
                >
                    Sign in
                </a>
            </header>

            <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-10 lg:pb-24 lg:pt-20">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
                    Discord aesthetics, done
                </p>

                <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                    Build a{" "}
                    <span className="bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
                        complete Discord look
                    </span>
                    , then bring it to your server
                </h1>

                <p className="mt-6 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base lg:text-lg">
                    Aesthetic King designs the banner, avatar, colors, bio and status for you.
                    Save what you like, organize it into collections, and run the same generator
                    for your whole server.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                    <a
                        href="/api/auth/discord"
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 hover:shadow-violet-500/30"
                    >
                        <Crown
                            size={17}
                            strokeWidth={2.2}
                        />

                        Continue with Discord
                    </a>

                    <p className="text-xs text-zinc-600">
                        No password. We only read your Discord identity.
                    </p>
                </div>

                <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {features.map((feature) => (
                        <div
                            className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6 transition hover:border-violet-500/25"
                            key={feature.title}
                        >
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-400">
                                <feature.icon
                                    size={19}
                                />
                            </div>

                            <h2 className="mt-4 text-sm font-semibold text-zinc-100">
                                {feature.title}
                            </h2>

                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                {feature.body}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <footer className="relative border-t border-white/[0.05]">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7 text-xs text-zinc-600">
                    <p>
                        Aesthetic King Studio
                    </p>

                    <p>
                        Not affiliated with Discord.
                    </p>
                </div>
            </footer>
        </main>
    );
}