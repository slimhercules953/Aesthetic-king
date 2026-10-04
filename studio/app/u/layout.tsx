import Link from "next/link";

/**
 * Chrome for the publicly readable part of the site (`/u/...`).
 *
 * The dashboard layout owns the sidebar, the topbar and the auth wall. None of
 * that can wrap a creator profile, because the whole point of the page is that
 * it opens for someone who has never signed in. This layout replaces only the
 * visual shell; it deliberately performs no authentication.
 */
export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#08080c] text-white">
            <header className="border-b border-white/[0.06] bg-[#0b0b11]/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 sm:px-6 lg:px-8">
                    <Link
                        href="/"
                        className="flex items-center gap-2.5"
                    >
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold">
                            AK
                        </span>

                        <span className="text-sm font-semibold tracking-wide">
                            Aesthetic King
                        </span>
                    </Link>

                    <nav className="flex items-center gap-2">
                        <Link
                            href="/dashboard/discover"
                            className="rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:text-white"
                        >
                            Discover
                        </Link>

                        <Link
                            href="/api/auth/discord"
                            className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                        >
                            Sign in
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="px-5 py-8 sm:px-6 lg:px-8 lg:py-10">
                <div className="mx-auto max-w-[1500px]">
                    {children}
                </div>
            </main>

            <footer className="mt-16 border-t border-white/[0.06] px-5 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-[1500px] flex-col gap-2 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        Aesthetic King — Discord identity, profiles and
                        aesthetics.
                    </span>

                    <Link
                        href="/"
                        className="transition hover:text-zinc-400"
                    >
                        Make your own
                    </Link>
                </div>
            </footer>
        </div>
    );
}
