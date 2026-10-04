"use client";

import { useState } from "react";

import Modal from "../ui/Modal";

/**
 * Danger zone for the account page.
 *
 * Deleting an account is the only irreversible thing a user can do here,
 * so it is behind a typed confirmation rather than a single button. The
 * confirm dialog goes through `Modal` because a plain absolutely-positioned
 * overlay inside this card gets painted under the sidebar and header.
 */
export default function DangerZone({
    username,
}: {
    username: string;
}) {
    const [open, setOpen] = useState(false);
    const [confirmation, setConfirmation] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ready =
        confirmation.trim().toLowerCase() ===
        username.trim().toLowerCase();

    async function confirmDelete() {
        if (!ready || busy) return;

        setBusy(true);
        setError(null);

        try {
            const response = await fetch("/api/account", {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = (await response
                    .json()
                    .catch(() => null)) as {
                    error?: string;
                } | null;

                setError(
                    data?.error ??
                        "Could not delete your account. Try again."
                );
                return;
            }

            /*
             * The session cookie is cleared by the endpoint. A client-side
             * redirect to the landing page then has nothing to read, so
             * the hard navigation is what actually ends the session in
             * the browser rather than a soft route change.
             */
            window.location.assign("/");
        } catch {
            setError("Could not reach the server. Try again.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="rounded-3xl border border-rose-500/20 bg-rose-500/[0.04] p-6">
            <h2 className="text-sm font-semibold text-rose-200">
                Danger zone
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Deleting your account removes every aesthetic, palette,
                profile and collection you have saved, along with your
                Crowns and anything you have shared to the feed. Your
                Discord server is not affected, and Aesthetic King stays
                installed there.
            </p>

            <button
                type="button"
                onClick={() => {
                    setConfirmation("");
                    setError(null);
                    setOpen(true);
                }}
                className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-200 transition hover:border-rose-500/50 hover:bg-rose-500/15"
            >
                Delete my account
            </button>

            {open && (
                <Modal
                    label="Delete account"
                    className="z-[120]"
                >
                    <div className="w-full max-w-lg rounded-3xl border border-white/[0.08] bg-[#101015] p-6 shadow-2xl shadow-black/60">
                        <h3 className="text-lg font-semibold text-zinc-100">
                            Delete {username}?
                        </h3>

                        <p className="mt-3 text-sm leading-6 text-zinc-400">
                            This cannot be undone. Type your username
                            below to confirm.
                        </p>

                        <input
                            autoFocus
                            value={confirmation}
                            onChange={(event) =>
                                setConfirmation(
                                    event.target.value
                                )
                            }
                            placeholder={username}
                            className="mt-4 h-11 w-full rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-4 text-sm text-zinc-100 outline-none focus:border-rose-500/50"
                        />

                        {error && (
                            <p className="mt-3 text-sm text-rose-300">
                                {error}
                            </p>
                        )}

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                disabled={!ready || busy}
                                onClick={confirmDelete}
                                className="rounded-xl bg-rose-500/80 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy
                                    ? "Deleting…"
                                    : "Permanently delete"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </section>
    );
}
