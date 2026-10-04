/**
 * Route-level skeleton for every page under `/dashboard`.
 *
 * The dashboard layout renders the sidebar and topbar before suspending, so
 * this replaces only the scrollable `<main>` column — the frame stays put and
 * the page does not jump when data lands.
 *
 * Deliberately generic (a header block plus a card grid) rather than
 * per-page-accurate: with 30 pages, a shape that is roughly right everywhere
 * beats 30 skeletons that each drift out of date.
 */
export default function DashboardLoading() {
    return (
        <div
            className="animate-pulse"
            aria-busy="true"
            aria-live="polite"
        >
            <span className="sr-only">
                Loading page
            </span>

            <div className="h-3 w-28 rounded-full bg-white/[0.05]" />

            <div className="mt-4 h-9 w-72 max-w-full rounded-xl bg-white/[0.06]" />

            <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-white/[0.04]" />

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from(
                    {
                        length: 6,
                    }
                ).map(
                    (_, index) => (
                        <div
                            key={
                                index
                            }
                            className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-5"
                        >
                            <div className="h-24 rounded-xl bg-white/[0.04]" />

                            <div className="mt-4 h-4 w-2/3 rounded-full bg-white/[0.05]" />

                            <div className="mt-2.5 h-3 w-1/2 rounded-full bg-white/[0.03]" />
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
