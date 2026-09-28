"use client";

import {
    FolderPlus,
    X,
} from "lucide-react";

import {
    useRouter,
} from "next/navigation";

import {
    useState,
} from "react";

export default function CreateCollectionButton() {
    const router =
        useRouter();

    const [
        open,
        setOpen,
    ] = useState(false);

    const [
        name,
        setName,
    ] = useState("");

    const [
        description,
        setDescription,
    ] = useState("");

    const [
        busy,
        setBusy,
    ] = useState(false);

    async function create() {
        if (!name.trim()) {
            return;
        }

        setBusy(true);

        try {
            const response =
                await fetch(
                    "/api/collections",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                name,
                                description,
                            }),
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Could not create collection."
                );
            }

            setName("");
            setDescription("");
            setOpen(false);

            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setOpen(true)
                }
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5"
            >
                <FolderPlus
                    size={17}
                />

                New Collection
            </button>

            {open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#121218] p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                                    Collections
                                </p>

                                <h2 className="mt-2 text-xl font-semibold">
                                    Create collection
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(
                                        false
                                    )
                                }
                                className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                            >
                                <X
                                    size={18}
                                />
                            </button>
                        </div>

                        <input
                            value={
                                name
                            }
                            onChange={(
                                event
                            ) =>
                                setName(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Collection name"
                            maxLength={100}
                            className="mt-6 h-12 w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40"
                        />

                        <textarea
                            value={
                                description
                            }
                            onChange={(
                                event
                            ) =>
                                setDescription(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Optional description"
                            rows={4}
                            className="mt-3 w-full resize-none rounded-xl border border-white/[0.08] bg-black/30 p-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40"
                        />

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(
                                        false
                                    )
                                }
                                className="rounded-xl px-4 py-2.5 text-sm text-zinc-500 transition hover:text-white"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                disabled={
                                    busy ||
                                    !name.trim()
                                }
                                onClick={
                                    create
                                }
                                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                            >
                                {busy
                                    ? "Creating..."
                                    : "Create Collection"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}