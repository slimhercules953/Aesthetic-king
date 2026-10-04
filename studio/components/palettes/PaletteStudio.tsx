"use client";

import {
    Check,
    Copy,
    Palette,
    Plus,
    Save,
    Trash2,
    X,
} from "lucide-react";

import AddPaletteToCollectionButton from "../collections/AddPaletteToCollectionButton";

import ShareToFeedButton from "../feed/ShareToFeedButton";

import Modal from "../ui/Modal";

import {
    useRouter,
} from "next/navigation";

import {
    useMemo,
    useState,
} from "react";

import type {
    SavedPalette,
} from "../../lib/palettes";

type PaletteCollectionOption = {
    id: string;
    name: string;
    description: string | null;
    containsPalette: boolean;
};

type PaletteStudioProps = {
    savedPalettes: SavedPalette[];

    paletteCollections: Record<
        string,
        PaletteCollectionOption[]
    >;
};

const DEFAULT_COLORS = [
    "#7C3AED",
    "#A855F7",
    "#EC4899",
];

function normalizeHex(
    value: string
) {
    let next =
        value
            .trim()
            .toUpperCase();

    if (
        next &&
        !next.startsWith("#")
    ) {
        next =
            `#${next}`;
    }

    return next;
}

function isValidHex(
    value: string
) {
    return /^#[0-9A-F]{6}$/i.test(
        value
    );
}

export default function PaletteStudio({
    savedPalettes,
    paletteCollections,
}: PaletteStudioProps) {
    const router =
        useRouter();

    const [
        name,
        setName,
    ] = useState("");

    const [
        aestheticId,
        setAestheticId,
    ] = useState("");

    const [
        moodId,
        setMoodId,
    ] = useState("");

    const [
        colors,
        setColors,
    ] = useState(
        DEFAULT_COLORS
    );

    const [
        saving,
        setSaving,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    const validPalette =
        useMemo(
            () =>
                colors.length >=
                    3 &&
                colors.length <=
                    6 &&
                colors.every(
                    isValidHex
                ),
            [
                colors,
            ]
        );

    function updateColor(
        index: number,
        value: string
    ) {
        setColors(
            (
                current
            ) =>
                current.map(
                    (
                        color,
                        colorIndex
                    ) =>
                        colorIndex ===
                        index
                            ? normalizeHex(
                                  value
                              )
                            : color
                )
        );
    }

    function addColor() {
        if (
            colors.length >=
            6
        ) {
            return;
        }

        setColors(
            (
                current
            ) => [
                ...current,
                "#18181B",
            ]
        );
    }

    function removeColor(
        index: number
    ) {
        if (
            colors.length <=
            3
        ) {
            return;
        }

        setColors(
            (
                current
            ) =>
                current.filter(
                    (
                        _,
                        colorIndex
                    ) =>
                        colorIndex !==
                        index
                )
        );
    }

    async function savePalette() {
        if (
            !validPalette ||
            saving
        ) {
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const response =
                await fetch(
                    "/api/palettes",
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
                                aestheticId,
                                moodId,
                                colors,
                            }),
                    }
                );

            const body =
                await response.json() as {
                    error?: string;
                };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not save palette."
                );
            }

            setName("");
            setAestheticId("");
            setMoodId("");
            setColors(
                DEFAULT_COLORS
            );

            router.refresh();
        } catch (
            caughtError
        ) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-start justify-between gap-5">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                                Builder
                            </p>

                            <h2 className="mt-2 text-2xl font-semibold">
                                Create Palette
                            </h2>

                            <p className="mt-2 text-sm text-zinc-500">
                                Build a reusable 3–6 color palette.
                            </p>
                        </div>

                        <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400">
                            <Palette
                                size={21}
                            />
                        </div>
                    </div>

                    <div className="mt-7 grid gap-4 md:grid-cols-3">
                        <label className="block">
                            <span className="text-xs font-medium text-zinc-500">
                                Name
                            </span>

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
                                placeholder="Midnight Bloom"
                                className="mt-2 h-11 w-full rounded-xl border border-white/[0.07] bg-black/20 px-3 text-sm text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-500/35"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium text-zinc-500">
                                Aesthetic
                            </span>

                            <input
                                value={
                                    aestheticId
                                }
                                onChange={(
                                    event
                                ) =>
                                    setAestheticId(
                                        event
                                            .target
                                            .value
                                    )
                                }
                                placeholder="gothic"
                                className="mt-2 h-11 w-full rounded-xl border border-white/[0.07] bg-black/20 px-3 text-sm text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-500/35"
                            />
                        </label>

                        <label className="block">
                            <span className="text-xs font-medium text-zinc-500">
                                Mood
                            </span>

                            <input
                                value={
                                    moodId
                                }
                                onChange={(
                                    event
                                ) =>
                                    setMoodId(
                                        event
                                            .target
                                            .value
                                    )
                                }
                                placeholder="dramatic"
                                className="mt-2 h-11 w-full rounded-xl border border-white/[0.07] bg-black/20 px-3 text-sm text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-violet-500/35"
                            />
                        </label>
                    </div>

                    <div className="mt-7">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium">
                                    Colors
                                </p>

                                <p className="mt-1 text-xs text-zinc-600">
                                    {
                                        colors.length
                                    }{" "}
                                    of 6 colors
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={
                                    addColor
                                }
                                disabled={
                                    colors.length >=
                                    6
                                }
                                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-violet-500/20 hover:text-violet-300 disabled:opacity-30"
                            >
                                <Plus
                                    size={14}
                                />

                                Add Color
                            </button>
                        </div>

                        <div className="mt-4 space-y-3">
                            {colors.map(
                                (
                                    color,
                                    index
                                ) => (
                                    <div
                                        key={
                                            index
                                        }
                                        className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-3"
                                    >
                                        <input
                                            type="color"
                                            value={
                                                isValidHex(
                                                    color
                                                )
                                                    ? color
                                                    : "#000000"
                                            }
                                            onChange={(
                                                event
                                            ) =>
                                                updateColor(
                                                    index,
                                                    event
                                                        .target
                                                        .value
                                                )
                                            }
                                            className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                                        />

                                        <input
                                            value={
                                                color
                                            }
                                            onChange={(
                                                event
                                            ) =>
                                                updateColor(
                                                    index,
                                                    event
                                                        .target
                                                        .value
                                                )
                                            }
                                            maxLength={
                                                7
                                            }
                                            className={[
                                                "h-10 flex-1 rounded-xl border bg-[#0c0c11] px-3 font-mono text-sm outline-none transition",
                                                isValidHex(
                                                    color
                                                )
                                                    ? "border-white/[0.06] text-zinc-300 focus:border-violet-500/35"
                                                    : "border-red-500/30 text-red-300",
                                            ].join(
                                                " "
                                            )}
                                        />

                                        <button
                                            type="button"
                                            onClick={() =>
                                                removeColor(
                                                    index
                                                )
                                            }
                                            disabled={
                                                colors.length <=
                                                3
                                            }
                                            className="rounded-xl p-2.5 text-zinc-600 transition hover:bg-red-500/[0.07] hover:text-red-400 disabled:opacity-20"
                                        >
                                            <X
                                                size={
                                                    16
                                                }
                                            />
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {error && (
                        <p className="mt-5 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm text-red-400">
                            {
                                error
                            }
                        </p>
                    )}

                    <div className="mt-7 flex justify-end">
                        <button
                            type="button"
                            onClick={
                                savePalette
                            }
                            disabled={
                                !validPalette ||
                                saving
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                        >
                            <Save
                                size={16}
                            />

                            {saving
                                ? "Saving..."
                                : "Save Palette"}
                        </button>
                    </div>
                </section>

                <section className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                    <div
                        className="grid min-h-72"
                        style={{
                            gridTemplateColumns:
                                `repeat(${colors.length}, minmax(0, 1fr))`,
                        }}
                    >
                        {colors.map(
                            (
                                color,
                                index
                            ) => (
                                <div
                                    key={
                                        index
                                    }
                                    className="relative"
                                    style={{
                                        backgroundColor:
                                            isValidHex(
                                                color
                                            )
                                                ? color
                                                : "#18181B",
                                    }}
                                >
                                    <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/45 px-2 py-1 font-mono text-[10px] text-white/80 backdrop-blur">
                                        {
                                            color
                                        }
                                    </span>
                                </div>
                            )
                        )}
                    </div>

                    <div className="p-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Live Preview
                        </p>

                        <h2 className="mt-2 text-xl font-semibold">
                            {name.trim() ||
                                "Untitled Palette"}
                        </h2>

                        <p className="mt-2 text-sm text-zinc-500">
                            {aestheticId ||
                                "No aesthetic"}{" "}
                            •{" "}
                            {moodId ||
                                "No mood"}
                        </p>
                    </div>
                </section>
            </div>

            <section className="mt-8">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Library
                        </p>

                        <h2 className="mt-2 text-2xl font-semibold">
                            Saved Palettes
                        </h2>
                    </div>

                    <p className="text-sm text-zinc-600">
                        {
                            savedPalettes.length
                        }{" "}
                        saved
                    </p>
                </div>

                {savedPalettes.length ===
                0 ? (
                    <div className="mt-6 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                        <Palette
                            size={27}
                            className="text-zinc-700"
                        />

                        <h3 className="mt-4 text-lg font-semibold">
                            No palettes saved yet
                        </h3>

                        <p className="mt-2 max-w-md text-sm text-zinc-600">
                            Build your first palette above and save it to your Studio library.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {savedPalettes.map(
                            (
                                palette
                            ) => (
                                <SavedPaletteCard
                                    key={
                                        palette.id
                                    }
                                    palette={
                                        palette
                                    }
                                    collections={
                                        paletteCollections[
                                            palette.id
                                        ] ?? []
                                    }
                                />
                            )
                        )}
                    </div>
                )}
            </section>
        </>
    );
}

function SavedPaletteCard({
    palette,
    collections,
}: {
    palette: SavedPalette;

    collections:
        PaletteCollectionOption[];
}) {
    const router =
        useRouter();

    const [
        copied,
        setCopied,
    ] = useState(false);

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
        palette.name ||
            "Untitled Palette"
    );

    const [
        busy,
        setBusy,
    ] = useState(false);

    async function copyColors() {
        await navigator.clipboard.writeText(
            palette.colors.join(
                ", "
            )
        );

        setCopied(true);

        window.setTimeout(
            () =>
                setCopied(
                    false
                ),
            1500
        );
    }

    async function rename() {
        if (!name.trim()) {
            return;
        }

        setBusy(true);

        try {
            const response =
                await fetch(
                    `/api/palettes/${palette.id}`,
                    {
                        method:
                            "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                name,
                            }),
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Could not rename palette."
                );
            }

            setRenameOpen(
                false
            );

            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        setBusy(true);

        try {
            const response =
                await fetch(
                    `/api/palettes/${palette.id}`,
                    {
                        method:
                            "DELETE",
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Could not delete palette."
                );
            }

            setDeleteOpen(
                false
            );

            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <article className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                <div
                    className="grid h-32"
                    style={{
                        gridTemplateColumns:
                            `repeat(${palette.colors.length}, minmax(0, 1fr))`,
                    }}
                >
                    {palette.colors.map(
                        (
                            color,
                            index
                        ) => (
                            <div
                                key={`${color}-${index}`}
                                style={{
                                    backgroundColor:
                                        color,
                                }}
                            />
                        )
                    )}
                </div>

                <div className="p-5">
                    <h3 className="text-lg font-semibold">
                        {palette.name ||
                            "Untitled Palette"}
                    </h3>

                    <p className="mt-2 text-sm text-zinc-600">
                        {palette.aestheticId ||
                            "No aesthetic"}{" "}
                        •{" "}
                        {palette.moodId ||
                            "No mood"}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {palette.colors.map(
                            (
                                color
                            ) => (
                                <span
                                    key={
                                        color
                                    }
                                    className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 font-mono text-[10px] text-zinc-500"
                                >
                                    {
                                        color
                                    }
                                </span>
                            )
                        )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.05] pt-4">
                        <button
                            type="button"
                            onClick={
                                copyColors
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] px-3 py-2 text-xs text-zinc-400 transition hover:text-white"
                        >
                            {copied ? (
                                <Check
                                    size={
                                        14
                                    }
                                />
                            ) : (
                                <Copy
                                    size={
                                        14
                                    }
                                />
                            )}

                            {copied
                                ? "Copied"
                                : "Copy"}
                        </button>

                        <AddPaletteToCollectionButton
                            paletteId={
                                palette.id
                            }
                            collections={
                                collections
                            }
                        />

                        <ShareToFeedButton
                            itemType="PALETTE"
                            itemId={palette.id}
                            defaultTitle={
                                palette.name ||
                                "Untitled Palette"
                            }
                            compact
                        />

                        <button
                            type="button"
                            onClick={() =>
                                setRenameOpen(
                                    true
                                )
                            }
                            className="rounded-xl border border-white/[0.06] px-3 py-2 text-xs text-zinc-400 transition hover:text-white"
                        >
                            Rename
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                setDeleteOpen(
                                    true
                                )
                            }
                            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-red-500/15 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/[0.06]"
                        >
                            <Trash2
                                size={
                                    14
                                }
                            />

                            Delete
                        </button>
                    </div>
                </div>
            </article>

            {renameOpen && (
                <Modal className="p-5" label="Rename palette">
                    <div className="w-full max-w-md rounded-3xl border border-white/[0.08] bg-[#121218] p-6">
                        <h3 className="text-xl font-semibold">
                            Rename Palette
                        </h3>

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
                            className="mt-5 h-12 w-full rounded-xl border border-white/[0.08] bg-black/30 px-4 text-sm text-white outline-none focus:border-violet-500/40"
                        />

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setRenameOpen(
                                        false
                                    )
                                }
                                className="rounded-xl px-4 py-2.5 text-sm text-zinc-500"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                disabled={
                                    busy
                                }
                                onClick={
                                    rename
                                }
                                className="rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                            >
                                {busy
                                    ? "Saving..."
                                    : "Save"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {deleteOpen && (
                <Modal className="p-5" label="Delete palette">
                    <div className="w-full max-w-md rounded-3xl border border-red-500/15 bg-[#121218] p-6">
                        <h3 className="text-xl font-semibold">
                            Delete Palette?
                        </h3>

                        <p className="mt-3 text-sm leading-6 text-zinc-500">
                            This will permanently delete this saved palette.
                        </p>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setDeleteOpen(
                                        false
                                    )
                                }
                                className="rounded-xl px-4 py-2.5 text-sm text-zinc-500"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                disabled={
                                    busy
                                }
                                onClick={
                                    remove
                                }
                                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                            >
                                {busy
                                    ? "Deleting..."
                                    : "Delete"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
