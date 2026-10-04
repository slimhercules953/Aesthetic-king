"use client";

import { useState } from "react";

import {
    Loader2,
    RefreshCw,
    Sparkles,
    Wand2,
} from "lucide-react";

import { AESTHETICS } from "../../lib/aesthetics";
import { COMPLETABLE_COLOR_NAMES } from "../../lib/completionColors";

import type { ProfileSetOption } from "../../lib/profileSetOptions";

import type { ProfileDraft } from "../../lib/profileModel";

import type { CompletionAccess } from "../../lib/profileWorkspace";

type ProfileCompletionPanelProps = {
    draft: ProfileDraft;

    /** The same grid the set picker shows, so the two agree on ids. */
    sets: ProfileSetOption[];

    access: CompletionAccess;

    /**
     * Called with the composed draft. The panel never writes to the draft
     * itself — the Builder owns the draft and its autosave, and a second
     * writer would fight it. The panel reports what was filled in its own
     * status line, so the Builder only has to adopt the result.
     */
    onApply: (draft: ProfileDraft) => void;
};

type SeedKind = "set" | "aesthetic" | "color" | "palette";

type CompletionResponse = {
    draft?: ProfileDraft;
    filled?: string[];
    ai?: boolean;
    remaining?: number | null;
    error?: string;
};

const KINDS: { id: SeedKind; label: string }[] = [
    { id: "set", label: "Profile set" },
    { id: "aesthetic", label: "Aesthetic" },
    { id: "color", label: "Color" },
    { id: "palette", label: "My palette" },
];

const FIELD_LABELS: Record<string, string> = {
    name: "name",
    profileSetId: "profile set",
    username: "username",
    discriminator: "discriminator",
    pronouns: "pronouns",
    bio: "bio",
    status: "status",
    symbols: "symbols",
    palette: "palette",
    accentColor: "accent color",
};

const selectClass =
    "w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/60";

/**
 * "Complete My Profile" — one seed in, a whole coordinated identity out.
 *
 * The panel is a suggestion, not a rewrite: the server only fills fields
 * the draft leaves empty, and it returns the list of what it touched so
 * this component can say so out loud. Everything the user already typed
 * comes back unchanged.
 */
export default function ProfileCompletionPanel({
    draft,
    sets,
    access,
    onApply,
}: ProfileCompletionPanelProps) {
    const [kind, setKind] = useState<SeedKind>("set");
    const [setId, setSetId] = useState<string>(sets[0]?.id ?? "");
    const [aestheticId, setAestheticId] = useState<string>(AESTHETICS[0].id);
    const [colorName, setColorName] = useState<string>(COMPLETABLE_COLOR_NAMES[0]);

    const [useAi, setUseAi] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ filled: string[]; ai: boolean } | null>(null);

    /** The set the last composition used, so "Reroll" avoids repeating it. */
    const [lastSetId, setLastSetId] = useState<string | null>(null);
    const [remaining, setRemaining] = useState<number | null>(access.remaining);

    const hasPalette = draft.palette.length > 0;

    function buildBody(reroll: boolean): Record<string, unknown> {
        /*
         * The wire shape is the server's, not this component's: `id` for a
         * set and an aesthetic, `name` for a color, `colors` for a palette.
         * `parseCompletionSeed` rejects anything else, so a field renamed
         * here would look like a working UI that always 400s.
         */
        const seed: Record<string, unknown> =
            kind === "set"
                ? { kind: "profileSet", id: setId }
                : kind === "aesthetic"
                    ? { kind: "aesthetic", id: aestheticId }
                    : kind === "color"
                        ? { kind: "color", name: colorName }
                        : { kind: "palette", colors: draft.palette };

        const body: Record<string, unknown> = {
            seed,
            draft,
            useAi,
        };

        if (reroll && lastSetId) {
            body.excludeSetId = lastSetId;
        }

        return body;
    }

    async function run(reroll: boolean) {
        if (kind === "set" && !setId) {
            setError("Pick a profile set first.");
            return;
        }

        if (kind === "palette" && !hasPalette) {
            setError("Add at least one color to your palette first.");
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const response = await fetch("/api/profiles/complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildBody(reroll)),
            });

            const data = (await response.json().catch(() => ({}))) as CompletionResponse;

            if (!response.ok || !data.draft) {
                throw new Error(data.error ?? "Could not complete this profile.");
            }

            onApply(data.draft);

            setLastSetId(data.draft.profileSetId ?? null);
            if (typeof data.remaining === "number") {
                setRemaining(data.remaining);
            }
            setResult({ filled: data.filled ?? [], ai: Boolean(data.ai) });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not complete this profile.");
        } finally {
            setBusy(false);
        }
    }

    const exhausted = access.allowed && remaining === 0;

    return (
        <section className="rounded-3xl border border-violet-500/20 bg-[#101015] p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                        <Wand2 size={15} className="text-violet-400" />

                        Complete My Profile
                    </h2>

                    <p className="mt-2 max-w-xl text-xs leading-6 text-zinc-500">
                        Give it one thing you like and it builds the rest —
                        set, username, bio, status, symbols and palette.
                        Anything you have already typed is left alone.
                    </p>
                </div>

                <span className="shrink-0 rounded-full bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-400">
                    {remaining === null
                        ? "Unlimited"
                        : `${remaining} left this month`}
                </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-1.5">
                {KINDS.map((option) => {
                    const disabled = option.id === "palette" && !hasPalette;

                    return (
                        <button
                            key={option.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => setKind(option.id)}
                            className={`rounded-xl px-3 py-1.5 text-xs transition ${
                                kind === option.id
                                    ? "bg-violet-500/15 text-violet-200"
                                    : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
                            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                        >
                            {option.id === "palette" && !hasPalette
                                ? "My palette (empty)"
                                : option.label}
                        </button>
                    );
                })}
            </div>

            <div className="mt-3">
                {kind === "set" && (
                    <select
                        value={setId}
                        onChange={(event) => setSetId(event.target.value)}
                        className={selectClass}
                    >
                        {sets.map((set) => (
                            <option key={set.id} value={set.id}>
                                Set {set.id}
                                {set.premium ? " (Pro)" : ""}
                            </option>
                        ))}
                    </select>
                )}

                {kind === "aesthetic" && (
                    <select
                        value={aestheticId}
                        onChange={(event) => setAestheticId(event.target.value)}
                        className={selectClass}
                    >
                        {AESTHETICS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.name}
                            </option>
                        ))}
                    </select>
                )}

                {kind === "color" && (
                    <select
                        value={colorName}
                        onChange={(event) => setColorName(event.target.value)}
                        className={selectClass}
                    >
                        {COMPLETABLE_COLOR_NAMES.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                )}

                {kind === "palette" && (
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                            {draft.palette.slice(0, 8).map((color) => (
                                <span
                                    key={color}
                                    className="h-5 w-5 rounded-md border border-white/10"
                                    style={{ background: color }}
                                />
                            ))}
                        </div>

                        <span className="text-xs text-zinc-600">
                            {draft.palette.length} colors
                        </span>
                    </div>
                )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    disabled={busy || !access.allowed || exhausted}
                    onClick={() => void run(false)}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}

                    Complete my profile
                </button>

                {lastSetId && (
                    <button
                        type="button"
                        disabled={busy || !access.allowed || exhausted}
                        onClick={() => void run(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-300 transition hover:border-violet-500/60 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <RefreshCw size={15} />

                        Reroll
                    </button>
                )}

                <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
                    <input
                        type="checkbox"
                        checked={useAi}
                        onChange={(event) => setUseAi(event.target.checked)}
                        className="accent-violet-500"
                    />

                    Rewrite the text with AI
                </label>
            </div>

            {!access.allowed && (
                <p className="mt-3 text-xs text-amber-300/80">
                    {access.limit === 0
                        ? "Complete My Profile is not available on your plan yet."
                        : "You have used every completion in this period. It resets on the first of next month."}
                </p>
            )}

            {access.allowed && exhausted && (
                <p className="mt-3 text-xs text-amber-300/80">
                    No completions left this month. Unlock more with Crowns
                    or upgrade for 100 a month.
                </p>
            )}

            {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

            {result && !error && (
                <p className="mt-3 text-xs text-zinc-500">
                    {result.filled.length === 0 ? (
                        <>
                            Everything was already filled in — nothing
                            changed. Try a different seed, or clear a field
                            first.
                        </>
                    ) : (
                        <>
                            Filled{" "}
                            {result.filled
                                .map((field) => FIELD_LABELS[field] ?? field)
                                .join(", ")}
                            .{result.ai ? " Text rewritten by AI." : ""}
                        </>
                    )}
                </p>
            )}
        </section>
    );
}
