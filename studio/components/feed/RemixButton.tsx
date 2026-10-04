"use client";

import {
    Check,
    Sparkles,
} from "lucide-react";

import {
    useState,
} from "react";

/*
 * The Remix action on a feed card.
 *
 * Deliberately a leaf: it imports nothing from `lib` that could reach `pg`,
 * so a client component can render it without dragging the server into the
 * bundle.
 *
 * The button reports the outcome rather than the feed doing it, because the
 * useful next step is in the remixer's own library — the response carries
 * the new item's id, and this is the only place that has it.
 */

type RemixResponse = {
    success?: boolean;

    item?: {
        itemType: string;
        itemId: string;
        name: string;
    };

    /** Present when the request hit a Premium or limit wall. */
    upgradeHref?: string;
    crownsHref?: string;
    label?: string;

    error?: string;
};

function detailHref(
    item: { itemType: string; itemId: string }
): string | null {
    if (item.itemType === "AESTHETIC") {
        return `/dashboard/aesthetics/${item.itemId}`;
    }

    /*
     * Palettes are edited from the library page rather than a per-item
     * route, which is the same target `hydratePalettes` uses.
     */
    if (item.itemType === "PALETTE") {
        return "/dashboard/palettes";
    }

    return null;
}

type RemixButtonProps = {
    postId: string;
    onNotice?: (
        message: string | null
    ) => void;
};

export default function RemixButton({
    postId,
    onNotice,
}: RemixButtonProps) {
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [href, setHref] = useState<
        string | null
    >(null);

    async function remix() {
        if (busy || done) {
            return;
        }

        setBusy(true);
        onNotice?.(null);

        try {
            const response =
                await fetch(
                    `/api/feed/${postId}/remix`,
                    {
                        method:
                            "POST",
                    }
                );

            const body =
                await response.json() as RemixResponse;

            if (!response.ok) {
                /*
                 * A denial body names the feature and where to get it; the
                 * link is rendered next to the button. A plain 400 from the
                 * lib ("this is already your work") has no href, so only the
                 * message is shown.
                 */
                onNotice?.(
                    body.error ??
                        "Could not remix this post."
                );

                const link =
                    body.upgradeHref ??
                    body.crownsHref ??
                    null;

                if (link) {
                    setHref(link);
                }

                return;
            }

            setDone(true);
            setHref(
                body.item
                    ? detailHref(body.item)
                    : null
            );
        } catch {
            onNotice?.(
                "Could not remix this post."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="ml-3 flex items-center gap-2">
            <button
                type="button"
                onClick={remix}
                disabled={busy || done}
                title="Copy this into your library with credit to the creator"
                className={[
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition",
                    done
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-zinc-500 hover:bg-white/[0.05] hover:text-violet-300",
                ].join(
                    " "
                )}
            >
                {done ? (
                    <Check
                        size={15}
                    />
                ) : (
                    <Sparkles
                        size={15}
                    />
                )}

                {done
                    ? "Remixed"
                    : busy
                    ? "Remixing…"
                    : "Remix"}
            </button>

            {href && (
                <a
                    href={href}
                    className="text-xs text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-violet-300"
                >
                    {done
                        ? "Open"
                        : "Unlock"}
                </a>
            )}
        </div>
    );
}
