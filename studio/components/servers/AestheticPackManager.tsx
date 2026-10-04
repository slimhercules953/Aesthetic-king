"use client";

import {
    Check,
    ChevronDown,
    Pencil,
    Plus,
    Save,
    Star,
    Trash2,
    X,
} from "lucide-react";

import {
    useMemo,
    useState,
} from "react";

import {
    AESTHETICS,
} from "../../lib/aesthetics";

import {
    MOODS,
} from "../../lib/moods";

import Modal from "../ui/Modal";

import type {
    ServerAestheticPack,
} from "../../lib/aestheticPacks";

type Props = {
    guildId: string;
    initialPacks:
    ServerAestheticPack[];
    initialDefaultPackId:
    string | null;
};

type DraftPack = {
    id?: string;
    name: string;
    description: string;
    aestheticId: string;
    moodId: string;
    colors: string[];
    symbols: string[];
    enabled: boolean;
};

const EMPTY_PACK:
    DraftPack = {
    name: "",
    description: "",
    aestheticId: "",
    moodId: "",
    colors: [
        "#7C5CFF",
        "#A78BFA",
    ],
    symbols: [],
    enabled: true,
};

export default function AestheticPackManager({
    guildId,
    initialPacks,
    initialDefaultPackId,
}: Props) {
    const [
        packs,
        setPacks,
    ] = useState(
        initialPacks
    );

    const [
        defaultPackId,
        setDefaultPackId,
    ] = useState(
        initialDefaultPackId
    );

    const [
        draft,
        setDraft,
    ] = useState<
        DraftPack | null
    >(null);

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

    const enabledCount =
        useMemo(
            () =>
                packs.filter(
                    (pack) =>
                        pack.enabled
                ).length,
            [
                packs,
            ]
        );

    function editPack(
        pack: ServerAestheticPack
    ) {
        setDraft({
            id:
                pack.id,
            name:
                pack.name,
            description:
                pack.description ??
                "",
            aestheticId:
                pack.aestheticId ??
                "",
            moodId:
                pack.moodId ??
                "",
            colors:
                [...pack.colors],
            symbols:
                [...pack.symbols],
            enabled:
                pack.enabled,
        });
    }

    async function saveDraft() {
        if (
            !draft ||
            saving
        ) {
            return;
        }

        setSaving(true);
        setError(null);

        const editing =
            Boolean(
                draft.id
            );

        const response =
            await fetch(
                editing
                    ? `/api/servers/${guildId}/packs/${draft.id}`
                    : `/api/servers/${guildId}/packs`,
                {
                    method:
                        editing
                            ? "PATCH"
                            : "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify({
                            name:
                                draft.name,
                            description:
                                draft.description,
                            aestheticId:
                                draft.aestheticId ||
                                null,
                            moodId:
                                draft.moodId ||
                                null,
                            colors:
                                draft.colors,
                            symbols:
                                draft.symbols,
                            enabled:
                                draft.enabled,
                        }),
                }
            );

        const body =
            await response.json() as {
                pack?:
                ServerAestheticPack;
                error?:
                string;
            };

        if (!response.ok) {
            setError(
                body.error ||
                "Could not save Aesthetic Pack."
            );

            setSaving(false);
            return;
        }

        if (body.pack) {
            const savedPack =
                body.pack;

            setPacks(
                (
                    current
                ) =>
                    editing
                        ? current.map(
                            (
                                pack
                            ) =>
                                pack.id ===
                                    savedPack.id
                                    ? savedPack
                                    : pack
                        )
                        : [
                            ...current,
                            savedPack,
                        ].sort(
                            (
                                a,
                                b
                            ) =>
                                a.name.localeCompare(
                                    b.name
                                )
                        )
            );
        }

        setDraft(null);
        setSaving(false);
    }

    async function deletePack(
        packId: string
    ) {
        const response =
            await fetch(
                `/api/servers/${guildId}/packs/${packId}`,
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
            setError(
                body.error ||
                "Could not delete Aesthetic Pack."
            );

            return;
        }

        setPacks(
            (
                current
            ) =>
                current.filter(
                    (
                        pack
                    ) =>
                        pack.id !==
                        packId
                )
        );

        if (
            defaultPackId ===
            packId
        ) {
            setDefaultPackId(
                null
            );
        }
    }

    async function toggleEnabled(
        pack: ServerAestheticPack
    ) {
        const response =
            await fetch(
                `/api/servers/${guildId}/packs/${pack.id}`,
                {
                    method:
                        "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify({
                            name:
                                pack.name,
                            description:
                                pack.description,
                            aestheticId:
                                pack.aestheticId,
                            moodId:
                                pack.moodId,
                            colors:
                                pack.colors,
                            symbols:
                                pack.symbols,
                            enabled:
                                !pack.enabled,
                        }),
                }
            );

        const body =
            await response.json() as {
                pack?:
                ServerAestheticPack;
                error?:
                string;
            };

        if (!response.ok) {
            setError(
                body.error ||
                "Could not update Aesthetic Pack."
            );

            return;
        }

        if (body.pack) {
            setPacks(
                (
                    current
                ) =>
                    current.map(
                        (
                            item
                        ) =>
                            item.id ===
                                pack.id
                                ? body.pack!
                                : item
                    )
            );
        }
    }

    async function setDefaultPack(
        packId: string | null
    ) {
        const response =
            await fetch(
                `/api/servers/${guildId}/packs/default`,
                {
                    method:
                        "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify({
                            packId,
                        }),
                }
            );

        const body =
            await response.json() as {
                error?: string;
            };

        if (!response.ok) {
            setError(
                body.error ||
                "Could not update default Pack."
            );

            return;
        }

        setDefaultPackId(
            packId
        );
    }

    return (
        <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-zinc-500">
                        {
                            packs.length
                        } pack
                        {
                            packs.length ===
                                1
                                ? ""
                                : "s"
                        }
                        {" â€¢ "}
                        {
                            enabledCount
                        } enabled
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() =>
                        setDraft({
                            ...EMPTY_PACK,
                            colors:
                                [
                                    ...EMPTY_PACK.colors,
                                ],
                            symbols:
                                [],
                        })
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white"
                >
                    <Plus
                        size={
                            16
                        }
                    />
                    Create Pack
                </button>
            </div>

            {error && (
                <p className="mt-5 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm text-red-400">
                    {
                        error
                    }
                </p>
            )}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {packs.map(
                    (
                        pack
                    ) => (
                        <article
                            key={
                                pack.id
                            }
                            className="rounded-3xl border border-white/[0.06] bg-[#101015] p-5"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-lg font-semibold text-zinc-200">
                                            {
                                                pack.name
                                            }
                                        </h3>

                                        {defaultPackId ===
                                            pack.id && (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                                                    <Star
                                                        size={
                                                            11
                                                        }
                                                    />
                                                    Default
                                                </span>
                                            )}

                                        <span
                                            className={
                                                pack.enabled
                                                    ? "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
                                                    : "rounded-full border border-white/[0.06] bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-600"
                                            }
                                        >
                                            {pack.enabled
                                                ? "Enabled"
                                                : "Disabled"}
                                        </span>
                                    </div>

                                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                                        {pack.description ||
                                            "No description."}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        editPack(
                                            pack
                                        )
                                    }
                                    className="rounded-xl border border-white/[0.06] p-2 text-zinc-500 transition hover:text-zinc-200"
                                >
                                    <Pencil
                                        size={
                                            16
                                        }
                                    />
                                </button>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                {pack.aestheticId && (
                                    <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs text-violet-300">
                                        {
                                            pack.aestheticId
                                        }
                                    </span>
                                )}

                                {pack.moodId && (
                                    <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-300">
                                        {
                                            pack.moodId
                                        }
                                    </span>
                                )}
                            </div>

                            <div className="mt-5 flex gap-2">
                                {pack.colors.map(
                                    (
                                        color
                                    ) => (
                                        <div
                                            key={
                                                color
                                            }
                                            title={
                                                color
                                            }
                                            className="h-8 w-8 rounded-full border border-white/10"
                                            style={{
                                                backgroundColor:
                                                    color,
                                            }}
                                        />
                                    )
                                )}
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                {pack.symbols.map(
                                    (
                                        symbol
                                    ) => (
                                        <span
                                            key={
                                                symbol
                                            }
                                            className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 text-sm text-zinc-400"
                                        >
                                            {
                                                symbol
                                            }
                                        </span>
                                    )
                                )}
                            </div>

                            <div className="mt-6 grid gap-2 sm:grid-cols-3">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setDefaultPack(
                                            defaultPackId ===
                                                pack.id
                                                ? null
                                                : pack.id
                                        )
                                    }
                                    className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
                                >
                                    {defaultPackId ===
                                        pack.id
                                        ? "Clear Default"
                                        : "Set Default"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        toggleEnabled(
                                            pack
                                        )
                                    }
                                    className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-xs font-medium text-zinc-400 transition hover:text-zinc-200"
                                >
                                    {pack.enabled
                                        ? "Disable"
                                        : "Enable"}
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        deletePack(
                                            pack.id
                                        )
                                    }
                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-500/10 bg-red-500/[0.04] px-3 py-2 text-xs font-medium text-red-400"
                                >
                                    <Trash2
                                        size={
                                            13
                                        }
                                    />
                                    Delete
                                </button>
                            </div>
                        </article>
                    )
                )}
            </div>

            {packs.length ===
                0 && (
                    <div className="mt-6 rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                        <p className="font-semibold text-zinc-300">
                            No Aesthetic Packs yet
                        </p>

                        <p className="mt-2 text-sm text-zinc-600">
                            Create your first coordinated
                            aesthetic preset for this server.
                        </p>
                    </div>
                )}

            {draft && (
                <Modal label={draft.id ? "Edit pack" : "Create pack"}>
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[0.08] bg-[#101015] p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                                    Aesthetic Pack
                                </p>

                                <h2 className="mt-2 text-2xl font-bold">
                                    {draft.id
                                        ? "Edit Pack"
                                        : "Create Pack"}
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setDraft(
                                        null
                                    )
                                }
                                className="rounded-xl border border-white/[0.06] p-2 text-zinc-500"
                            >
                                <X
                                    size={
                                        18
                                    }
                                />
                            </button>
                        </div>

                        <div className="mt-6 grid gap-5">
                            <input
                                value={
                                    draft.name
                                }
                                onChange={(
                                    event
                                ) =>
                                    setDraft({
                                        ...draft,
                                        name:
                                            event.target.value,
                                    })
                                }
                                placeholder="Pack name"
                                className="h-12 rounded-xl border border-white/[0.07] bg-black/20 px-4 text-sm text-zinc-200 outline-none"
                            />

                            <textarea
                                value={
                                    draft.description
                                }
                                onChange={(
                                    event
                                ) =>
                                    setDraft({
                                        ...draft,
                                        description:
                                            event.target.value,
                                    })
                                }
                                placeholder="Description"
                                rows={
                                    3
                                }
                                className="rounded-xl border border-white/[0.07] bg-black/20 px-4 py-3 text-sm text-zinc-200 outline-none"
                            />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <select
                                    value={
                                        draft.aestheticId
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setDraft({
                                            ...draft,
                                            aestheticId:
                                                event.target.value,
                                        })
                                    }
                                    className="h-12 rounded-xl border border-white/[0.07] bg-black/20 px-4 text-sm text-zinc-300"
                                >
                                    <option value="">
                                        No aesthetic
                                    </option>

                                    {AESTHETICS.map(
                                        (
                                            aesthetic
                                        ) => (
                                            <option
                                                key={
                                                    aesthetic.id
                                                }
                                                value={
                                                    aesthetic.id
                                                }
                                            >
                                                {
                                                    aesthetic.name
                                                }
                                            </option>
                                        )
                                    )}
                                </select>

                                <select
                                    value={
                                        draft.moodId
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setDraft({
                                            ...draft,
                                            moodId:
                                                event.target.value,
                                        })
                                    }
                                    className="h-12 rounded-xl border border-white/[0.07] bg-black/20 px-4 text-sm text-zinc-300"
                                >
                                    <option value="">
                                        No mood
                                    </option>

                                    {MOODS.map(
                                        (
                                            mood
                                        ) => (
                                            <option
                                                key={
                                                    mood.id
                                                }
                                                value={
                                                    mood.id
                                                }
                                            >
                                                {
                                                    mood.name
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-zinc-500">
                                    Colors
                                </label>

                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {draft.colors.map(
                                        (
                                            color,
                                            index
                                        ) => (
                                            <input
                                                key={
                                                    index
                                                }
                                                value={
                                                    color
                                                }
                                                onChange={(
                                                    event
                                                ) => {
                                                    const colors =
                                                        [
                                                            ...draft.colors,
                                                        ];

                                                    colors[
                                                        index
                                                    ] =
                                                        event.target.value;

                                                    setDraft({
                                                        ...draft,
                                                        colors,
                                                    });
                                                }}
                                                className="h-11 rounded-xl border border-white/[0.07] bg-black/20 px-3 font-mono text-sm text-zinc-300"
                                            />
                                        )
                                    )}
                                </div>

                                {draft.colors.length <
                                    5 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setDraft({
                                                    ...draft,
                                                    colors:
                                                        [
                                                            ...draft.colors,
                                                            "#FFFFFF",
                                                        ],
                                                })
                                            }
                                            className="mt-2 text-xs text-violet-400"
                                        >
                                            + Add color
                                        </button>
                                    )}
                            </div>

                            <div>
                                <label className="text-xs font-medium text-zinc-500">
                                    Symbols
                                </label>

                                <input
                                    value={
                                        draft.symbols.join(
                                            " "
                                        )
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setDraft({
                                            ...draft,
                                            symbols:
                                                event.target.value
                                                    .split(
                                                        /\s+/
                                                    )
                                                    .filter(
                                                        Boolean
                                                    )
                                                    .slice(
                                                        0,
                                                        8
                                                    ),
                                        })
                                    }
                                    placeholder="âœ¦ â˜¾ â™±"
                                    className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-black/20 px-4 text-sm text-zinc-300"
                                />
                            </div>

                            <label className="flex items-center gap-3 text-sm text-zinc-400">
                                <input
                                    type="checkbox"
                                    checked={
                                        draft.enabled
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setDraft({
                                            ...draft,
                                            enabled:
                                                event.target.checked,
                                        })
                                    }
                                />
                                Enabled
                            </label>
                        </div>

                        <div className="mt-7 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    setDraft(
                                        null
                                    )
                                }
                                className="rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm text-zinc-400"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={
                                    saveDraft
                                }
                                disabled={
                                    saving
                                }
                                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                <Save
                                    size={
                                        15
                                    }
                                />
                                {saving
                                    ? "Saving..."
                                    : "Save Pack"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
