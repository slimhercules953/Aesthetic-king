"use client";

import { useRouter } from "next/navigation";

import { Lock } from "lucide-react";

import UpgradePrompt from "../ui/UpgradePrompt";

import type { FeatureDeniedBody } from "../../lib/denied";

/**
 * Replaces the download actions on a premium profile set the viewer
 * has not unlocked.
 *
 * The preview stays visible - hiding it would hide the thing worth
 * paying for - so this only swaps the actions for a way to unlock
 * them. Spending Crowns refreshes the page, which flips the server
 * render into the unlocked layout.
 */
export default function PremiumAssetLock({
    denied,
}: {
    denied: FeatureDeniedBody;
}) {
    const router = useRouter();

    return (
        <div className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                <Lock className="h-3.5 w-3.5" />
                Premium profile set
            </p>

            <h2 className="mt-2 text-lg font-semibold">
                Unlock this set to use it
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                You can see the preview, but saving it to a collection
                or sharing it needs Premium or a Crown unlock.
            </p>

            <div className="mt-5">
                <UpgradePrompt
                    denied={denied}
                    onUnlocked={() => router.refresh()}
                />
            </div>
        </div>
    );
}
