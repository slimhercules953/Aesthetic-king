"use client";

import Link from "next/link";

import {
    useState,
} from "react";

import {
    useRouter,
} from "next/navigation";

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
 *
 * The Crown button spends for real. When the caller passes
 * `onUnlocked` it can retry whatever the user was doing, so paying
 * and continuing is one click; otherwise the page refreshes so the
 * new allowance shows up.
 */
export default function UpgradePrompt({
    denied,
    onUnlocked,
    className = "",
}: {
    denied: FeatureDeniedBody;
    onUnlocked?: () => void;
    className?: string;
}) {
    const router =
        useRouter();

    const [
        busy,
        setBusy,
    ] = useState(false);

    const [
        failure,
        setFailure,
    ] = useState<string | null>(
        null
    );

    const isLocked =
        denied.code === "FEATURE_LOCKED";

    const canBuy =
        denied.crownUnlockAvailable &&
        denied.crownCost !== null;

    async function buy() {
        if (busy) {
            return;
        }

        setBusy(true);
        setFailure(null);

        try {
            const response =
                await fetch(
                    "/api/crowns/unlock",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                feature:
                                    denied.feature,
                            }),
                    }
                );

            const payload =
                await response
                    .json()
                    .catch(
                        () =>
                            null
                    );

            if (!response.ok) {
                setFailure(
                    (
                        payload as {
                            error?: string;
                        } | null
                    )?.error ??
                    "Could not complete that purchase."
                );

                return;
            }

            if (onUnlocked) {
                onUnlocked();
            } else {
                router.refresh();
            }
        } catch {
            setFailure(
                "Could not reach Aesthetic King. Try again."
            );
        } finally {
            setBusy(false);
        }
    }

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
                        <button
                            type="button"
                            onClick={buy}
                            disabled={busy}
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
                                disabled:opacity-50
                            "
                        >
                            <Coins className="h-3.5 w-3.5" />
                            {busy
                                ? "Spending…"
                                : `Use ${denied.crownCost} Crowns`}
                        </button>
                    )}
            </div>

            {failure && (
                <p className="mt-3 text-xs text-rose-300">
                    {failure}
                </p>
            )}

            {denied.crownUnlockAvailable &&
                denied.crownCost !== null && (
                    <p className="mt-3 text-[11px] text-zinc-500">
                        <Link
                            href={denied.crownsHref}
                            className="
                                underline
                                decoration-zinc-700
                                underline-offset-2
                                hover:text-zinc-300
                            "
                        >
                            View Crown balance and history
                        </Link>
                    </p>
                )}
        </div>
    );
}
