"use client";

import Link from "next/link";

import {
    Coins,
    Sparkles,
} from "lucide-react";

import type { FeatureDeniedBody } from "../../lib/denied";

/**
 * Shown whenever the server refuses an action for entitlement reasons.
 *
 * The product rule: never a bare "Premium required". Every refusal
 * offers a way forward, and if Crowns can unlock the action that
 * option sits right next to the upgrade link.
 */
export default function UpgradePrompt({
    denied,
    className = "",
}: {
    denied: FeatureDeniedBody;
    className?: string;
}) {
    const isLocked =
        denied.code === "FEATURE_LOCKED";

    return (
        <div
            className={`
                rounded-2xl
                border border-amber-400/20
                bg-gradient-to-br
                from-amber-500/[0.10]
                to-fuchsia-500/[0.06]
                p-4
                ${className}
            `}
        >
            <p className="text-sm font-medium text-zinc-100">
                {denied.error}
            </p>

            <p className="mt-1 text-xs text-zinc-500">
                {isLocked
                    ? "Premium unlocks this across the studio."
                    : denied.tracked &&
                        denied.limit !== null
                      ? `${denied.used} of ${denied.limit} used in the current period.`
                      : "Your allowance refreshes with the next billing period."}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
                <Link
                    href={denied.upgradeHref}
                    className="
                        inline-flex
                        items-center
                        gap-1.5
                        rounded-xl
                        bg-gradient-to-r
                        from-violet-500
                        to-fuchsia-500
                        px-3 py-2
                        text-xs font-semibold
                        text-white
                        transition-opacity
                        hover:opacity-90
                    "
                >
                    <Sparkles className="h-3.5 w-3.5" />
                    Explore Premium
                </Link>

                {denied.crownUnlockAvailable &&
                    denied.crownCost !== null && (
                        <Link
                            href={denied.crownsHref}
                            className="
                                inline-flex
                                items-center
                                gap-1.5
                                rounded-xl
                                border
                                border-amber-400/30
                                bg-amber-400/10
                                px-3 py-2
                                text-xs font-semibold
                                text-amber-200
                                transition-colors
                                hover:bg-amber-400/20
                            "
                        >
                            <Coins className="h-3.5 w-3.5" />
                            Use {denied.crownCost}{" "}
                            Crowns
                        </Link>
                    )}
            </div>
        </div>
    );
}
