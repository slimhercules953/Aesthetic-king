"use client";

import {
    Pencil,
    Trash2,
    X,
} from "lucide-react";

import {
    useRouter,
} from "next/navigation";

import {
    useState,
} from "react";

import Modal from "../ui/Modal";

type AestheticActionsProps = {
    id: string;
    currentName: string;
};

export default function AestheticActions({
    id,
    currentName,
}: AestheticActionsProps) {
    const router =
        useRouter();

    const [
        renameOpen,
        setRenameOpen,
    ] = useState(false);

    const [
        deleteOpen,
        setDeleteOpen,
    ] = useState(false);

    const [
        name,
        setName,
    ] = useState(
        currentName
    );

    const [
        busy,
        setBusy,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    async function renameAesthetic() {
        setBusy(true);
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/aesthetics/${id}`,
                    {
                        method:
                            "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                {
                                    name,
                                }
                            ),
                    }
                );

            const body =
                await response.json() as {
                    error?: string;
                };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not rename aesthetic."
                );
            }

            setRenameOpen(
                false
            );

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

    async function deleteAesthetic() {
        setBusy(true);
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/aesthetics/${id}`,
                    {
                        method:
                            "DELETE",
                    }
                );

            const body =
                await response.json() as {
                    error?: string;
                };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not delete aesthetic."
                );
            }

            router.push(
                "/dashboard/aesthetics"
            );

            router.refresh();
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );

            setBusy(false);
        }
    }

    return (
        <>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() =>
                        setRenameOpen(
                            true
                        )
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-violet-500/25 hover:bg-violet-500/[0.06] hover:text-white"
                >
                    <Pencil
                        size={16}
                    />

                    Rename
                </button>

                <button
                    type="button"
                    onClick={() =>
                        setDeleteOpen(
                            true
                        )
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-2.5 text-sm font-medium text-red-300 transition hover:border-red-500/30 hover:bg-red-500/10"
                >
                    <Trash2
                        size={16}
                    />

                    Delete
                </button>
            </div>

            {renameOpen && (
                <Modal className="p-5" label="Rename aesthetic">
                    <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#121218] p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                                    Edit
                                </p>

                                <h2 className="mt-2 text-xl font-semibold">
                                    Rename aesthetic
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setRenameOpen(
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
                            maxLength={
                                100
                            }
                            className="mt-6 h-12 w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 text-sm text-white outline-none transition focus:border-violet-500/40"
                        />

                        {error && (
                            <p className="mt-3 text-sm text-red-400">
                                {
                                    error
                                }
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setRenameOpen(
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
                                    busy
                                }
                                onClick={
                                    renameAesthetic
                                }
                                className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {busy
                                    ? "Saving..."
                                    : "Save Name"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {deleteOpen && (
                <Modal className="p-5" label="Delete aesthetic">
                    <div className="w-full max-w-md rounded-3xl border border-red-500/15 bg-[#121218] p-6 shadow-2xl">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                            <Trash2
                                size={21}
                            />
                        </div>

                        <h2 className="mt-5 text-xl font-semibold">
                            Delete aesthetic?
                        </h2>

                        <p className="mt-3 text-sm leading-6 text-zinc-500">
                            This will permanently delete{" "}
                            <span className="text-zinc-300">
                                {
                                    currentName
                                }
                            </span>
                            . This action cannot be undone.
                        </p>

                        {error && (
                            <p className="mt-3 text-sm text-red-400">
                                {
                                    error
                                }
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setDeleteOpen(
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
                                    busy
                                }
                                onClick={
                                    deleteAesthetic
                                }
                                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-50"
                            >
                                {busy
                                    ? "Deleting..."
                                    : "Delete Permanently"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}