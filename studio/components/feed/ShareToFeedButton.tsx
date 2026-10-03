"use client";

import {
    Send,
    X,
} from "lucide-react";

import {
    useState,
} from "react";

import {
    useRouter,
} from "next/navigation";

import UpgradePrompt from "../ui/UpgradePrompt";

import {
    readDeniedBody,
    type FeatureDeniedBody,
} from "../../lib/denied";

type ShareToFeedButtonProps = {
    itemType: "AESTHETIC" | "PALETTE" | "ASSET";
    itemId: string;
    defaultTitle?: string;
    compact?: boolean;
};

export default function ShareToFeedButton({
    itemType,
    itemId,
    defaultTitle,
    compact = false,
}: ShareToFeedButtonProps) {
    const router =
        useRouter();

    const [
        open,
        setOpen,
    ] = useState(false);

    const [
        caption,
        setCaption,
    ] = useState("");

    const [
        tags,
        setTags,
    ] = useState("");

    const [
        busy,
        setBusy,
    ] = useState(false);

    const [
        shared,
        setShared,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    const [
        denied,
        setDenied,
    ] = useState<
        FeatureDeniedBody | null
    >(null);

    async function share() {
        setBusy(true);
        setError(null);
        setDenied(null);

        try {
            const response =
                await fetch(
                    "/api/feed",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                itemType,
                                itemId,
                                caption:
                                    caption.trim() ||
                                    null,
                                tags: tags
                                    .split(/[,\s]+/)
                                    .filter(Boolean),
                            }),
                    }
                );

            const body =
                await response.json() as {
                    error?: string;
                };

            if (!response.ok) {
                const refusal =
                    readDeniedBody(
                        response.status,
                        body
                    );

                if (refusal) {
                    setDenied(refusal);
                    return;
                }

                throw new Error(
                    body.error ||
                        "Could not share to the feed."
                );
            }

            setShared(true);
            setOpen(false);

            router.refresh();
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => {
                    setError(null);
                    setDenied(null);
                    setOpen(true);
                }}
                className={[
                    "inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15",
                    compact
                        ? "px-3 py-2 text-xs"
                        : "px-4 py-2.5 text-sm",
                ].join(
                    " "
                )}
            >
                <Send
                    size={
                        compact
                            ? 14
                            : 16
                    }
                />

                {shared
                    ? "Shared again"
                    : "Share to Feed"}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#101015] p-6 shadow-2xl shadow-black/60">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-zinc-100">
                                    Share to Discover
                                </h3>

                                <p className="mt-1 text-sm text-zinc-500">
                                    Push this to the community feed so others can like it.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(false)
                                }
                                aria-label="Close share dialog"
                                className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                            >
                                <X
                                    size={16}
                                />
                            </button>
                        </div>

                        {defaultTitle && (
                            <p className="mt-4 truncate rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-sm text-zinc-400">
                                {defaultTitle}
                            </p>
                        )}

                        <label className="mt-4 block">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                                Caption
                            </span>

                            <textarea
                                value={caption}
                                onChange={(event) =>
                                    setCaption(
                                        event.target.value
                                    )
                                }
                                rows={3}
                                maxLength={280}
                                placeholder="Say something about this aesthetic..."
                                className="mt-2 w-full resize-none rounded-xl border border-white/[0.05] bg-black/20 px-4 py-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500/30"
                            />
                        </label>

                        <label className="mt-4 block">
                            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                                Tags
                            </span>

                            <input
                                value={tags}
                                onChange={(event) =>
                                    setTags(
                                        event.target.value
                                    )
                                }
                                placeholder="gothic, dark, purple"
                                className="mt-2 h-11 w-full rounded-xl border border-white/[0.05] bg-black/20 px-4 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500/30"
                            />
                        </label>

                        {error && (
                            <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                                {error}
                            </p>
                        )}

                        {denied && (
                            <UpgradePrompt
                                denied={denied}
                                className="mt-4"
                                onUnlocked={() => {
                                    setDenied(
                                        null
                                    );
                                    void share();
                                }}
                            />
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(false)
                                }
                                className="rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={share}
                                disabled={busy}
                                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 disabled:opacity-60"
                            >
                                <Send
                                    size={15}
                                />

                                {busy
                                    ? "Sharing..."
                                    : "Share now"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
