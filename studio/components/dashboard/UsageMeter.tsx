import type {
    FeatureAccess,
} from "../../lib/featureAccess";

/**
 * A single usage bar for a metered feature.
 *
 * Deliberately does not render a number when the feature is not
 * tracked yet — "0 of 10" would be a lie about a feature nothing
 * records, and the handoff is explicit that the UI must not fake
 * instrumentation.
 */
export default function UsageMeter({
    access,
}: {
    access: FeatureAccess;
}) {
    const limit =
        access.limit;

    const unlimited =
        limit === null;

    const ratio =
        unlimited || limit === 0
            ? 0
            : Math.min(
                1,
                access.used / limit
            );

    const exhausted =
        !unlimited &&
        access.remaining !== null &&
        access.remaining <= 0;

    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">
                    {
                        access.label
                    }
                </p>

                <p className="text-xs text-zinc-500">
                    {
                        !access.tracked
                            ? "Not tracked yet"
                            : unlimited
                                ? `${access.used} used`
                                : `${access.used} of ${access.limit}`
                    }
                </p>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                    className={
                        "h-full rounded-full transition-all " +
                        (
                            exhausted
                                ? "bg-gradient-to-r from-amber-500 to-orange-500"
                                : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        )
                    }
                    style={{
                        width: `${Math.max(
                            ratio * 100,
                            access.used > 0
                                ? 4
                                : 0
                        )}%`,
                    }}
                />
            </div>

            <p className="mt-2 text-xs text-zinc-600">
                {
                    access.description
                }
            </p>
        </div>
    );
}
