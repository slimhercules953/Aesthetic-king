/**
 * Skeleton for the public creator profile.
 *
 * The page is a server component that awaits the profile, the author's feed
 * posts and their comments before it can render anything, so without this a
 * visitor clicking a creator link from Discord sees a blank dark screen for
 * the whole round trip.
 */
export default function CreatorProfileLoading() {
    return (
        <div
            className="animate-pulse"
            aria-busy="true"
            aria-live="polite"
        >
            <span className="sr-only">
                Loading creator profile
            </span>

            <div className="h-3 w-32 rounded-full bg-white/[0.05]" />

            <div className="mt-6 overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                <div className="h-28 bg-white/[0.02] sm:h-36" />

                <div className="px-6 pb-6">
                    <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
                        <div className="h-24 w-24 rounded-2xl border-4 border-[#101015] bg-white/[0.06]" />

                        <div className="min-w-0 flex-1 pb-1">
                            <div className="h-6 w-56 max-w-full rounded-lg bg-white/[0.06]" />

                            <div className="mt-3 h-3 w-40 rounded-full bg-white/[0.04]" />
                        </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        {Array.from(
                            {
                                length: 3,
                            }
                        ).map(
                            (_, index) => (
                                <div
                                    key={
                                        index
                                    }
                                    className="h-16 rounded-xl bg-white/[0.03]"
                                />
                            )
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-10 h-5 w-40 rounded-full bg-white/[0.05]" />

            <div className="mt-4 grid gap-6 xl:grid-cols-2">
                {Array.from(
                    {
                        length: 4,
                    }
                ).map(
                    (_, index) => (
                        <div
                            key={
                                index
                            }
                            className="h-64 rounded-3xl border border-white/[0.05] bg-white/[0.02]"
                        />
                    )
                )}
            </div>
        </div>
    );
}
