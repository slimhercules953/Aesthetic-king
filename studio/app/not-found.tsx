import Link from "next/link";

/**
 * Shown when a route matches nothing, and when a page calls `notFound()`.
 *
 * The root layout only supplies `<html>`/`<body>` and the dark background, so
 * this has to bring its own centred shell rather than assume the dashboard
 * frame is present.
 */
export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#08080c] px-6 text-center text-white">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-lg font-bold shadow-lg shadow-violet-500/20">
                AK
            </span>

            <p className="mt-8 text-6xl font-bold tracking-tight text-zinc-700">
                404
            </p>

            <h1 className="mt-3 text-xl font-semibold text-zinc-200">
                Nothing lives here
            </h1>

            <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                The page was moved, deleted, or never existed. If you followed a
                link from a Discord message, the item it pointed at may have
                been unshared by its author.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                    href="/dashboard"
                    className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-200 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                >
                    Go to your dashboard
                </Link>

                <Link
                    href="/dashboard/discover"
                    className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
                >
                    Browse Discover
                </Link>
            </div>
        </div>
    );
}
