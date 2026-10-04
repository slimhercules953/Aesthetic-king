"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    Check,
    Copy,
    Loader2,
    Plus,
    Save,
    Sparkles,
    Trash2,
    X,
} from "lucide-react";

import ProfilePreview from "./ProfilePreview";
import ProfileCompletionPanel from "./ProfileCompletionPanel";

import type {
    ProfileSetOption,
} from "../../lib/profileSetOptions";

/*
 * Type-only on purpose: `profileWorkspace.ts` reads the database, and a
 * value import here would drag server code into the browser bundle.
 */
import type { CompletionAccess } from "../../lib/profileWorkspace";

import {
    BUILDER_SET_LIMIT,
} from "../../lib/profileSetOptions";

import type {
    Profile,
} from "../../lib/profiles";

import {
    canSaveDraft,
    checkCompleteness,
    derivePreviewState,
    DRAFT_NEEDS_ART,
    MIN_PALETTE_COLORS,
    normalizeHex,
    PROFILE_LIMITS,
    type ProfileDraft,
} from "../../lib/profileModel";

type ProfileBuilderProps = {
    profile: Profile | null;

    /**
     * The user's other saved versions. Empty for a free user, who is
     * allowed one profile and no library.
     */
    profiles: Profile[];

    sets: ProfileSetOption[];

    fallbackUsername: string | null;

    advancedUnlocked: boolean;

    maxProfiles: number;

    completion: CompletionAccess;
};

type SaveState =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved" }
    | { kind: "error"; message: string };

type ProfileApiResponse = {
    profile?: { id: string };
    profiles?: unknown[];
    error?: string;
};

function draftFrom(
    profile: Profile | null
): ProfileDraft {
    if (!profile) {
        return {
            name: "My profile",
            profileSetId: null,

            username: null,
            discriminator: null,
            pronouns: null,

            bio: null,
            status: null,

            symbols: [],
            palette: [],

            accentColor: null,
        };
    }

    return {
        name: profile.name,
        profileSetId: profile.profileSetId,

        username: profile.username,
        discriminator: profile.discriminator,
        pronouns: profile.pronouns,

        bio: profile.bio,
        status: profile.status,

        symbols: profile.symbols,
        palette: profile.palette,

        accentColor: profile.accentColor,
    };
}

const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/60";

const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500";

export default function ProfileBuilder({
    profile,
    profiles,
    sets,
    fallbackUsername,
    advancedUnlocked,
    maxProfiles,
    completion,
}: ProfileBuilderProps) {
    const [draft, setDraft] = useState(() =>
        draftFrom(profile)
    );

    const [saveState, setSaveState] =
        useState<SaveState>({ kind: "idle" });

    const [symbolDraft, setSymbolDraft] =
        useState("");

    const [newColor, setNewColor] =
        useState("");

    const [
        setQuery,
        setQueryInput,
    ] = useState("");

    /*
     * The id we last loaded or saved. A save returns the row, so the
     * next save is a PATCH against this id rather than a second POST —
     * without it, pressing Save twice would create two profiles.
     */
    const [currentId, setCurrentId] =
        useState<string | null>(
            profile?.id ?? null
        );

    const [dirty, setDirty] =
        useState(false);

    const saveTimer =
        useRef<number | null>(null);

    useEffect(
        () => () => {
            if (saveTimer.current) {
                window.clearTimeout(
                    saveTimer.current
                );
            }
        },
        []
    );

    const update = (
        patch: Partial<ProfileDraft>
    ) => {
        setDraft((current) => ({
            ...current,
            ...patch,
        }));

        setDirty(true);
    };

    const preview = useMemo(
        () =>
            derivePreviewState(
                draft,
                fallbackUsername
            ),
        [draft, fallbackUsername]
    );

    const selectedSet =
        sets.find(
            (set) =>
                set.id === draft.profileSetId
        ) ?? null;

    const completeness = useMemo(
        () => checkCompleteness(draft),
        [draft]
    );

    const visibleSets = useMemo(() => {
        const query = setQuery.trim().toLowerCase();

        if (!query) {
            return sets.slice(0, BUILDER_SET_LIMIT);
        }

        return sets
            .filter(
                (set) =>
                    set.id.includes(query) ||
                    set.colors.some(
                        (color) =>
                            color
                                .toLowerCase()
                                .includes(query)
                    )
            )
            .slice(0, BUILDER_SET_LIMIT);
    }, [sets, setQuery]);

    /*
     * Typed loosely on purpose: the routes return either a `{ profile }`
     * body or an `{ error }` body, and the only fields the builder reads
     * are the id and the message.
     */
    async function request(
        method: string,
        url: string,
        body?: unknown
    ): Promise<ProfileApiResponse> {
        const response =
            await fetch(url, {
                method,

                headers: body
                    ? {
                        "Content-Type":
                            "application/json",
                    }
                    : undefined,

                body: body
                    ? JSON.stringify(body)
                    : undefined,
            });

        const data = (await response
            .json()
            .catch(() => ({}))) as
            ProfileApiResponse;

        if (!response.ok) {
            throw new Error(
                data.error ??
                "Could not save this profile."
            );
        }

        return data;
    }

    /*
     * Returns the id of the saved profile, or null when the save did not
     * happen or produced nothing. Callers like `makeActive` need the
     * value rather than reading `currentId` afterwards — state updates
     * are not visible to the closure that is already running, so a new
     * profile's id would still read as null right after being created.
     */
    async function save(): Promise<string | null> {
        if (!canSaveDraft(draft)) {
            setSaveState({
                kind: "error",
                message: DRAFT_NEEDS_ART,
            });

            return null;
        }

        setSaveState({ kind: "saving" });

        try {
            if (currentId) {
                const data = await request(
                    "PATCH",
                    `/api/profiles/${currentId}`,
                    draft
                );

                if (data.profile?.id) {
                    setCurrentId(
                        data.profile.id
                    );
                }

                setDirty(false);
                setSaveState({ kind: "saved" });

                return data.profile?.id ?? currentId;
            }

            const data = await request(
                "POST",
                "/api/profiles",
                draft
            );

            const id = data.profile?.id ?? null;

            setCurrentId(id);

            setDirty(false);
            setSaveState({ kind: "saved" });

            return id;
        } catch (error) {
            setSaveState({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Could not save this profile.",
            });

            return null;
        }
    }

    /*
     * Autosave is debounced rather than per-keystroke. The preview is
     * what makes the Builder feel live and it is entirely local — a save
     * on every character would only add a request per finger movement
     * and make typing feel laggy.
     *
     * A draft with no set and no usable palette is not sent at all. The
     * API would reject it, so autosaving it would turn "I typed a name"
     * into a red error message about colours. The status line says why
     * instead, and the first real save happens as soon as the draft is
     * saveable.
     */
    useEffect(() => {
        if (!dirty) {
            return;
        }

        if (saveTimer.current) {
            window.clearTimeout(
                saveTimer.current
            );
        }

        if (!canSaveDraft(draft)) {
            setSaveState({ kind: "idle" });
            return;
        }

        saveTimer.current = window.setTimeout(
            () => {
                void save();
            },
            1200
        );

        return () => {
            if (saveTimer.current) {
                window.clearTimeout(
                    saveTimer.current
                );
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, dirty]);

    async function saveAsNew() {
        if (!canSaveDraft(draft)) {
            setSaveState({
                kind: "error",
                message: DRAFT_NEEDS_ART,
            });

            return;
        }

        setSaveState({ kind: "saving" });

        try {
            const data = await request(
                "POST",
                "/api/profiles",
                {
                    ...draft,
                    name: `${draft.name} copy`,
                }
            );

            const id: string | undefined =
                data.profile?.id;

            if (id) {
                window.location.href =
                    `/dashboard/profile/${id}`;
            }
        } catch (error) {
            setSaveState({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Could not duplicate this profile.",
            });
        }
    }

    async function makeActive() {
        /*
         * Save first and take the id from the save rather than from
         * `currentId`. For a profile that has never been saved there is
         * no id to activate yet, and the `setCurrentId` inside `save()`
         * has not reached this closure's `currentId` by the time the
         * await returns — so reading the state here would quietly do
         * nothing at all.
         */
        const id = currentId ?? (await save());

        /*
         * A null id means the save did not happen, and `save()` already
         * said why — either the draft has nothing to paint with or the
         * request failed. Overwriting that with a generic prompt would
         * hide the actual reason.
         */
        if (!id) {
            return;
        }

        setSaveState({ kind: "saving" });

        try {
            await request(
                "PATCH",
                `/api/profiles/${id}`,
                { isActive: true }
            );

            setSaveState({ kind: "saved" });
        } catch (error) {
            setSaveState({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Could not make this profile active.",
            });
        }
    }

    async function remove() {
        if (!currentId) {
            return;
        }

        const ok = window.confirm(
            "Delete this profile? This cannot be undone."
        );

        if (!ok) {
            return;
        }

        try {
            await request(
                "DELETE",
                `/api/profiles/${currentId}`
            );

            window.location.href =
                "/dashboard/profile";
        } catch (error) {
            setSaveState({
                kind: "error",
                message:
                    error instanceof Error
                        ? error.message
                        : "Could not delete this profile.",
            });
        }
    }

    function addSymbol() {
        const value = symbolDraft.trim();

        if (!value) {
            return;
        }

        if (
            draft.symbols.length >=
            PROFILE_LIMITS.symbols
        ) {
            return;
        }

        if (!draft.symbols.includes(value)) {
            update({
                symbols: [
                    ...draft.symbols,
                    value,
                ],
            });
        }

        setSymbolDraft("");
    }

    function addColor() {
        const hex = normalizeHex(newColor);

        if (!hex) {
            return;
        }

        if (
            draft.palette.length >=
            PROFILE_LIMITS.palette
        ) {
            return;
        }

        if (!draft.palette.includes(hex)) {
            update({
                palette: [
                    ...draft.palette,
                    hex,
                ],
            });
        }

        setNewColor("");
    }

    const atLimit =
        !advancedUnlocked &&
        profiles.length >= maxProfiles &&
        !currentId;

    /*
     * The composed draft replaces the local one, and `dirty` makes the
     * existing autosave persist it — the panel must not POST on its own,
     * or a brand-new profile would be created twice: once by the panel and
     * again by the debounce that the same edit just armed.
     *
     * Replacing rather than merging is safe because the server was given
     * the current draft and only filled fields that were empty, so every
     * character the user typed is already inside what comes back.
     */
    function applyCompletion(composed: ProfileDraft) {
        setDraft(composed);
        setDirty(true);

        setSaveState({ kind: "idle" });
    }

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-6">
                <ProfileCompletionPanel
                    draft={draft}
                    sets={sets}
                    access={completion}
                    onApply={applyCompletion}
                />

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <h2 className="text-sm font-semibold text-zinc-200">
                        Identity
                    </h2>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label
                                className={labelClass}
                                htmlFor="profile-name"
                            >
                                Profile name
                            </label>

                            <input
                                id="profile-name"
                                className={inputClass}
                                value={draft.name}
                                maxLength={
                                    PROFILE_LIMITS.name
                                }
                                onChange={(e) =>
                                    update({
                                        name:
                                            e.target
                                                .value,
                                    })
                                }
                            />

                            <p className="mt-1.5 text-xs text-zinc-600">
                                Only you see this. It keeps
                                your saved versions apart.
                            </p>
                        </div>

                        <div>
                            <label
                                className={labelClass}
                                htmlFor="profile-username"
                            >
                                Display name
                            </label>

                            <input
                                id="profile-username"
                                className={inputClass}
                                value={
                                    draft.username ?? ""
                                }
                                maxLength={
                                    PROFILE_LIMITS.username
                                }
                                placeholder={
                                    fallbackUsername ??
                                    "your name"
                                }
                                onChange={(e) =>
                                    update({
                                        username:
                                            e.target
                                                .value,
                                    })
                                }
                            />
                        </div>

                        <div>
                            <label
                                className={labelClass}
                                htmlFor="profile-discriminator"
                            >
                                Discriminator
                            </label>

                            <input
                                id="profile-discriminator"
                                className={inputClass}
                                value={
                                    draft.discriminator ??
                                    ""
                                }
                                maxLength={
                                    PROFILE_LIMITS.discriminator
                                }
                                placeholder="0001"
                                onChange={(e) =>
                                    update({
                                        discriminator:
                                            e.target
                                                .value,
                                    })
                                }
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label
                                className={labelClass}
                                htmlFor="profile-pronouns"
                            >
                                Pronouns
                            </label>

                            <input
                                id="profile-pronouns"
                                className={inputClass}
                                value={
                                    draft.pronouns ?? ""
                                }
                                maxLength={
                                    PROFILE_LIMITS.pronouns
                                }
                                placeholder="she/her"
                                onChange={(e) =>
                                    update({
                                        pronouns:
                                            e.target
                                                .value,
                                    })
                                }
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label
                                className={labelClass}
                                htmlFor="profile-status"
                            >
                                Status
                            </label>

                            <input
                                id="profile-status"
                                className={inputClass}
                                value={
                                    draft.status ?? ""
                                }
                                maxLength={
                                    PROFILE_LIMITS.status
                                }
                                placeholder="currently: offline in spirit"
                                onChange={(e) =>
                                    update({
                                        status:
                                            e.target
                                                .value,
                                    })
                                }
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label
                                className={labelClass}
                                htmlFor="profile-bio"
                            >
                                About me
                            </label>

                            <textarea
                                id="profile-bio"
                                rows={4}
                                className={`${inputClass} resize-y`}
                                value={draft.bio ?? ""}
                                maxLength={
                                    PROFILE_LIMITS.bio
                                }
                                placeholder="A short bio that fits Discord's 190 characters."
                                onChange={(e) =>
                                    update({
                                        bio:
                                            e.target
                                                .value,
                                    })
                                }
                            />

                            <p className="mt-1.5 text-right text-xs text-zinc-600">
                                {(draft.bio ?? "").length}
                                /
                                {PROFILE_LIMITS.bio}
                            </p>
                        </div>
                    </div>
                </section>

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <h2 className="text-sm font-semibold text-zinc-200">
                        Profile set
                    </h2>

                    <p className="mt-1.5 text-xs text-zinc-500">
                        Picks the pfp and banner. Pick a
                        colour below instead to paint the
                        card from the palette.
                    </p>

                    <input
                        className={`${inputClass} mt-4`}
                        value={setQuery}
                        placeholder="Search sets by id or colour"
                        onChange={(e) =>
                            setQueryInput(
                                e.target.value
                            )
                        }
                    />

                    <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                        <button
                            type="button"
                            onClick={() =>
                                update({
                                    profileSetId: null,
                                })
                            }
                            className={`flex aspect-square items-center justify-center rounded-xl border text-[10px] transition ${
                                !draft.profileSetId
                                    ? "border-violet-500 text-violet-300"
                                    : "border-white/[0.08] text-zinc-600 hover:border-white/20"
                            }`}
                        >
                            None
                        </button>

                        {visibleSets.map(
                            (set) => (
                                <button
                                    key={set.id}
                                    type="button"
                                    title={`Set ${set.id}`}
                                    onClick={() =>
                                        update({
                                            profileSetId:
                                                set.id,
                                        })
                                    }
                                    className={`relative aspect-square overflow-hidden rounded-xl border transition ${
                                        draft.profileSetId ===
                                        set.id
                                            ? "border-violet-500"
                                            : "border-white/[0.08] hover:border-white/25"
                                    }`}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={set.pfpUrl}
                                        alt=""
                                        className="h-full w-full object-cover"
                                    />

                                    {set.premium && (
                                        <span className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[8px] font-bold uppercase text-amber-300">
                                            Pro
                                        </span>
                                    )}
                                </button>
                            )
                        )}
                    </div>

                    {visibleSets.length === 0 && (
                        <p className="mt-4 text-sm text-zinc-600">
                            No sets match
                            &ldquo;{setQuery}&rdquo;.
                        </p>
                    )}
                </section>

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <h2 className="text-sm font-semibold text-zinc-200">
                        Palette
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {draft.palette.map(
                            (color) => (
                                <div
                                    key={color}
                                    className="group relative h-12 w-12 overflow-hidden rounded-xl border border-white/[0.08]"
                                    style={{
                                        backgroundColor:
                                            color,
                                    }}
                                >
                                    <button
                                        type="button"
                                        title={`Remove ${color}`}
                                        onClick={() =>
                                            update({
                                                palette:
                                                    draft.palette.filter(
                                                        (
                                                            entry
                                                        ) =>
                                                            entry !==
                                                            color
                                                    ),
                                            })
                                        }
                                        className="absolute inset-0 hidden items-center justify-center bg-black/60 text-zinc-100 group-hover:flex"
                                    >
                                        <X
                                            size={14}
                                        />
                                    </button>
                                </div>
                            )
                        )}

                        <div className="flex items-center gap-2">
                            <input
                                className="w-28 rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-3 py-2.5 font-mono text-sm uppercase text-zinc-100 outline-none focus:border-violet-500/60"
                                value={newColor}
                                placeholder="#000000"
                                maxLength={7}
                                onChange={(e) =>
                                    setNewColor(
                                        e.target.value
                                    )
                                }
                                onKeyDown={(e) => {
                                    if (
                                        e.key ===
                                        "Enter"
                                    ) {
                                        e.preventDefault();

                                        addColor();
                                    }
                                }}
                            />

                            <button
                                type="button"
                                onClick={addColor}
                                className="rounded-xl border border-white/[0.08] p-2.5 text-zinc-400 transition hover:border-violet-500/60 hover:text-violet-300"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    {draft.palette.length <
                        MIN_PALETTE_COLORS && (
                        <p className="mt-3 text-xs text-amber-400/80">
                            A palette needs at least{" "}
                            {MIN_PALETTE_COLORS} colours.
                        </p>
                    )}

                    <div className="mt-5">
                        <label
                            className={labelClass}
                            htmlFor="accent-color"
                        >
                            Accent colour
                        </label>

                        <input
                            id="accent-color"
                            className={`${inputClass} max-w-40 font-mono uppercase`}
                            value={
                                draft.accentColor ?? ""
                            }
                            placeholder={
                                draft.palette[1] ??
                                "#EC4899"
                            }
                            maxLength={7}
                            onChange={(e) =>
                                update({
                                    accentColor:
                                        e.target.value ||
                                        null,
                                })
                            }
                        />

                        <p className="mt-1.5 text-xs text-zinc-600">
                            Blank uses the palette
                            &rsquo;s second colour.
                        </p>
                    </div>
                </section>

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <h2 className="text-sm font-semibold text-zinc-200">
                        Symbols
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-2">
                        {draft.symbols.map(
                            (symbol) => (
                                <span
                                    key={symbol}
                                    className="group inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-3 py-2 text-sm text-zinc-200"
                                >
                                    {symbol}

                                    <button
                                        type="button"
                                        title={`Remove ${symbol}`}
                                        onClick={() =>
                                            update({
                                                symbols:
                                                    draft.symbols.filter(
                                                        (
                                                            entry
                                                        ) =>
                                                            entry !==
                                                            symbol
                                                    ),
                                            })
                                        }
                                        className="text-zinc-600 transition hover:text-rose-400"
                                    >
                                        <X size={13} />
                                    </button>
                                </span>
                            )
                        )}
                    </div>

                    <div className="mt-4 flex gap-2">
                        <input
                            className={inputClass}
                            value={symbolDraft}
                            placeholder="Paste a symbol or cluster, e.g. ♡ ⋆ ˚"
                            onChange={(e) =>
                                setSymbolDraft(
                                    e.target.value
                                )
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter"
                                ) {
                                    e.preventDefault();

                                    addSymbol();
                                }
                            }}
                        />

                        <button
                            type="button"
                            onClick={addSymbol}
                            className="rounded-xl border border-white/[0.08] px-4 text-sm text-zinc-300 transition hover:border-violet-500/60 hover:text-violet-300"
                        >
                            Add
                        </button>
                    </div>
                </section>
            </div>

            <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
                <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-zinc-200">
                            Live preview
                        </h2>

                        {selectedSet && (
                            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                                Set {selectedSet.id}
                            </span>
                        )}
                    </div>

                    <div className="flex justify-center">
                        <ProfilePreview
                            state={preview}
                            pfpUrl={
                                selectedSet?.pfpUrl ??
                                null
                            }
                            bannerUrl={
                                selectedSet?.bannerUrl ??
                                null
                            }
                            pronouns={draft.pronouns}
                            status={draft.status}
                            bio={draft.bio}
                            symbols={draft.symbols}
                        />
                    </div>

                    {!completeness.complete && (
                        <p className="mt-4 text-xs leading-6 text-zinc-500">
                            <Sparkles
                                size={12}
                                className="mr-1 inline"
                            />
                            Still missing:{" "}
                            {completeness.missing.join(
                                ", "
                            )}
                        </p>
                    )}
                </div>

                <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={
                                saveState.kind ===
                                "saving"
                            }
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
                        >
                            {saveState.kind ===
                            "saving" ? (
                                <Loader2
                                    size={15}
                                    className="animate-spin"
                                />
                            ) : (
                                <Save size={15} />
                            )}

                            Save
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                void makeActive()
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-300 transition hover:border-violet-500/60 hover:text-violet-300"
                        >
                            <Check size={15} />

                            Make active
                        </button>

                        {advancedUnlocked && (
                            <button
                                type="button"
                                onClick={() =>
                                    void saveAsNew()
                                }
                                disabled={atLimit}
                                title={
                                    atLimit
                                        ? `Free plans keep ${maxProfiles} profile.`
                                        : undefined
                                }
                                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-300 transition hover:border-violet-500/60 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Copy size={15} />

                                Duplicate
                            </button>
                        )}

                        {currentId && (
                            <button
                                type="button"
                                onClick={() =>
                                    void remove()
                                }
                                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-400 transition hover:border-rose-500/50 hover:text-rose-300"
                            >
                                <Trash2 size={15} />

                                Delete
                            </button>
                        )}
                    </div>

                    <p className="mt-3 min-h-5 text-xs">
                        {saveState.kind ===
                            "saving" && (
                            <span className="text-zinc-500">
                                Saving…
                            </span>
                        )}

                        {saveState.kind ===
                            "saved" && (
                            <span className="text-emerald-400">
                                Saved.
                            </span>
                        )}

                        {saveState.kind ===
                            "error" && (
                            <span className="text-rose-400">
                                {saveState.message}
                            </span>
                        )}

                        {saveState.kind ===
                            "idle" &&
                            dirty && (
                            <span className="text-zinc-600">
                                {canSaveDraft(draft)
                                    ? "Unsaved changes…"
                                    : DRAFT_NEEDS_ART}
                            </span>
                        )}
                    </p>

                    {!advancedUnlocked && (
                        <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-xs leading-6 text-zinc-500">
                            Free plans edit one profile.
                            Saved versions, AI
                            recommendations and bulk
                            exports are part of Advanced
                            Profile Builder.
                        </p>
                    )}
                </div>

                {profiles.length > 1 && (
                    <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <h2 className="text-sm font-semibold text-zinc-200">
                            Your versions
                        </h2>

                        <ul className="mt-3 space-y-1">
                            {profiles.map(
                                (entry) => (
                                    <li key={entry.id}>
                                        <a
                                            href={`/dashboard/profile/${entry.id}`}
                                            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition hover:bg-white/[0.04] ${
                                                entry.id ===
                                                currentId
                                                    ? "text-violet-300"
                                                    : "text-zinc-400"
                                            }`}
                                        >
                                            <span className="truncate">
                                                {
                                                    entry.name
                                                }
                                            </span>

                                            {entry.isActive && (
                                                <span className="ml-2 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                                                    Active
                                                </span>
                                            )}
                                        </a>
                                    </li>
                                )
                            )}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
