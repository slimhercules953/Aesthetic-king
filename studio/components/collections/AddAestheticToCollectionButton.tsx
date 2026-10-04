"use client";

import {
    Check,
    FolderHeart,
    Plus,
    X,
} from "lucide-react";

import {
    useState,
} from "react";

import Modal from "../ui/Modal";

type CollectionOption = {
    id: string;
    name: string;
    description: string | null;
    containsAesthetic: boolean;
};

type Props = {
    aestheticId: string;
    collections: CollectionOption[];
};

export default function AddAestheticToCollectionButton({
    aestheticId,
    collections,
}: Props) {
    const [
        open,
        setOpen,
    ] = useState(false);

    const [
        memberships,
        setMemberships,
    ] = useState<Record<string, boolean>>(
        () =>
            Object.fromEntries(
                collections.map(
                    (collection) => [
                        collection.id,
                        collection.containsAesthetic,
                    ]
                )
            )
    );

    const [
        busyCollectionId,
        setBusyCollectionId,
    ] = useState<
        string | null
    >(null);

    async function toggleCollection(
        collectionId: string
    ) {
        if (busyCollectionId) {
            return;
        }

        const selected =
            memberships[
                collectionId
            ] ?? false;

        setBusyCollectionId(
            collectionId
        );

        try {
            const response =
                await fetch(
                    "/api/collections/aesthetic-items",
                    {
                        method:
                            selected
                                ? "DELETE"
                                : "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                collectionId,
                                aestheticId,
                            }),
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Could not update collection."
                );
            }

            setMemberships(
                (current) => ({
                    ...current,
                    [collectionId]:
                        !selected,
                })
            );
        } finally {
            setBusyCollectionId(
                null
            );
        }
    }

    const count =
        Object.values(
            memberships
        ).filter(Boolean).length;

    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setOpen(true)
                }
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-violet-500/25 hover:bg-violet-500/[0.06]"
            >
                <FolderHeart
                    size={16}
                />

                Collections

                {count > 0 && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                        {count}
                    </span>
                )}
            </button>

            {open && (
                <Modal className="p-5" label="Add aesthetic to collection">
                    <div className="w-full max-w-lg rounded-3xl border border-white/[0.08] bg-[#121218] shadow-2xl">
                        <div className="flex items-start justify-between border-b border-white/[0.06] p-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                                    Collections
                                </p>

                                <h2 className="mt-2 text-xl font-semibold">
                                    Add Aesthetic
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(false)
                                }
                                className="rounded-lg p-2 text-zinc-600 hover:bg-white/[0.05]"
                            >
                                <X
                                    size={18}
                                />
                            </button>
                        </div>

                        <div className="max-h-[420px] overflow-y-auto p-4">
                            {collections.length ===
                            0 ? (
                                <div className="rounded-2xl border border-dashed border-white/[0.08] p-8 text-center">
                                    <FolderHeart
                                        size={28}
                                        className="mx-auto text-zinc-700"
                                    />

                                    <h3 className="mt-4 font-medium">
                                        No collections yet
                                    </h3>

                                    <a
                                        href="/dashboard/collections"
                                        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-2.5 text-sm text-violet-300"
                                    >
                                        <Plus
                                            size={15}
                                        />

                                        Create Collection
                                    </a>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {collections.map(
                                        (
                                            collection
                                        ) => {
                                            const selected =
                                                memberships[
                                                    collection.id
                                                ] ?? false;

                                            const busy =
                                                busyCollectionId ===
                                                collection.id;

                                            return (
                                                <button
                                                    key={
                                                        collection.id
                                                    }
                                                    type="button"
                                                    disabled={
                                                        Boolean(
                                                            busyCollectionId
                                                        )
                                                    }
                                                    onClick={() =>
                                                        toggleCollection(
                                                            collection.id
                                                        )
                                                    }
                                                    className={[
                                                        "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
                                                        selected
                                                            ? "border-violet-500/25 bg-violet-500/[0.07]"
                                                            : "border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.03]",
                                                    ].join(
                                                        " "
                                                    )}
                                                >
                                                    <div
                                                        className={[
                                                            "flex h-10 w-10 items-center justify-center rounded-xl border",
                                                            selected
                                                                ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                                                                : "border-white/[0.06] text-zinc-600",
                                                        ].join(
                                                            " "
                                                        )}
                                                    >
                                                        {selected ? (
                                                            <Check
                                                                size={17}
                                                            />
                                                        ) : (
                                                            <FolderHeart
                                                                size={17}
                                                            />
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-zinc-200">
                                                            {
                                                                collection.name
                                                            }
                                                        </p>

                                                        <p className="mt-1 truncate text-xs text-zinc-600">
                                                            {collection.description ||
                                                                "No description"}
                                                        </p>
                                                    </div>

                                                    <span className="text-xs text-zinc-600">
                                                        {busy
                                                            ? "Saving..."
                                                            : selected
                                                            ? "Added"
                                                            : "Add"}
                                                    </span>
                                                </button>
                                            );
                                        }
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end border-t border-white/[0.06] p-4">
                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(false)
                                }
                                className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
