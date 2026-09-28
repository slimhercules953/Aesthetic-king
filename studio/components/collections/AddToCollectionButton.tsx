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

type CollectionOption = {
    id: string;
    name: string;
    description: string | null;
    containsAsset: boolean;
};

type AddToCollectionButtonProps = {
    setId: string;
    collections: CollectionOption[];
};

export default function AddToCollectionButton({
    setId,
    collections,
}: AddToCollectionButtonProps) {
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
                        collection.containsAsset,
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

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    async function toggleCollection(
        collectionId: string
    ) {
        if (
            busyCollectionId
        ) {
            return;
        }

        const currentlyAdded =
            memberships[
                collectionId
            ] ?? false;

        setBusyCollectionId(
            collectionId
        );

        setError(null);

        try {
            const response =
                await fetch(
                    "/api/collections/items",
                    {
                        method:
                            currentlyAdded
                                ? "DELETE"
                                : "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                collectionId,
                                setId,
                            }),
                    }
                );

            if (!response.ok) {
                const body =
                    await response.json() as {
                        error?: string;
                    };

                throw new Error(
                    body.error ||
                        "Could not update collection."
                );
            }

            setMemberships(
                (
                    current
                ) => ({
                    ...current,

                    [collectionId]:
                        !currentlyAdded,
                })
            );
        } catch (
            caughtError
        ) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        } finally {
            setBusyCollectionId(
                null
            );
        }
    }

    const collectionCount =
        Object.values(
            memberships
        ).filter(
            Boolean
        ).length;

    return (
        <>
            <button
                type="button"
                onClick={() =>
                    setOpen(true)
                }
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm font-medium text-zinc-400 transition hover:border-violet-500/20 hover:bg-violet-500/[0.05] hover:text-violet-300"
            >
                <FolderHeart
                    size={16}
                />

                Add to Collection

                {collectionCount >
                    0 && (
                    <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                        {
                            collectionCount
                        }
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-3xl border border-white/[0.08] bg-[#121218] shadow-2xl">
                        <div className="flex items-start justify-between border-b border-white/[0.06] p-6">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                                    Collections
                                </p>

                                <h2 className="mt-2 text-xl font-semibold">
                                    Add Profile Set{" "}
                                    {
                                        setId
                                    }
                                </h2>

                                <p className="mt-2 text-sm text-zinc-500">
                                    This asset can belong to multiple collections.
                                </p>
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

                                    <p className="mt-2 text-sm text-zinc-600">
                                        Create a collection first, then return here to organize this asset.
                                    </p>

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
                                                    collection
                                                        .id
                                                ] ??
                                                false;

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
                                                            : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.1] hover:bg-white/[0.03]",
                                                    ].join(
                                                        " "
                                                    )}
                                                >
                                                    <div
                                                        className={[
                                                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                                                            selected
                                                                ? "border-violet-500/30 bg-violet-500/15 text-violet-300"
                                                                : "border-white/[0.06] bg-black/20 text-zinc-600",
                                                        ].join(
                                                            " "
                                                        )}
                                                    >
                                                        {selected ? (
                                                            <Check
                                                                size={
                                                                    17
                                                                }
                                                            />
                                                        ) : (
                                                            <FolderHeart
                                                                size={
                                                                    17
                                                                }
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

                            {error && (
                                <p className="mt-4 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm text-red-400">
                                    {
                                        error
                                    }
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end border-t border-white/[0.06] p-4">
                            <button
                                type="button"
                                onClick={() =>
                                    setOpen(
                                        false
                                    )
                                }
                                className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}