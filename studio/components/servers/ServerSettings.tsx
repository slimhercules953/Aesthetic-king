"use client";

import {
    Check,
    Hash,
    Save,
    Sparkles,
} from "lucide-react";

import {
    useState,
} from "react";

import {
    AESTHETICS,
} from "../../lib/aesthetics";

import {
    MOODS,
} from "../../lib/moods";

type ServerSettingsProps = {
    guildId: string;

    initialGenerationChannelId:
        string | null;

    initialDefaultAestheticId:
        string | null;

    initialDefaultMoodId:
        string | null;
};

export default function ServerSettings({
    guildId,
    initialGenerationChannelId,
    initialDefaultAestheticId,
    initialDefaultMoodId,
}: ServerSettingsProps) {
    const [
        generationChannelId,
        setGenerationChannelId,
    ] = useState(
        initialGenerationChannelId ??
            ""
    );

    const [
        defaultAestheticId,
        setDefaultAestheticId,
    ] = useState(
        initialDefaultAestheticId ??
            ""
    );

    const [
        defaultMoodId,
        setDefaultMoodId,
    ] = useState(
        initialDefaultMoodId ??
            ""
    );

    const [
        saving,
        setSaving,
    ] = useState(false);

    const [
        saved,
        setSaved,
    ] = useState(false);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    async function saveSettings() {
        if (saving) {
            return;
        }

        setSaving(true);
        setSaved(false);
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/servers/${guildId}/settings`,
                    {
                        method:
                            "PATCH",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                generationChannelId:
                                    generationChannelId.trim() ||
                                    null,

                                defaultAestheticId:
                                    defaultAestheticId ||
                                    null,

                                defaultMoodId:
                                    defaultMoodId ||
                                    null,
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
                        "Could not save server settings."
                );
            }

            setSaved(true);

            window.setTimeout(
                () => {
                    setSaved(
                        false
                    );
                },
                2000
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
            setSaving(false);
        }
    }

    return (
        <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex items-start justify-between gap-5">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                        Server Studio
                    </p>

                    <h2 className="mt-2 text-xl font-semibold">
                        Server Defaults
                    </h2>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                        Configure how Aesthetic King
                        behaves inside this Discord
                        server.
                    </p>
                </div>

                <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400">
                    <Sparkles
                        size={20}
                    />
                </div>
            </div>

            <div className="mt-7 grid gap-6 lg:grid-cols-3">
                <div>
                    <label className="block">
                        <span className="text-xs font-medium text-zinc-500">
                            Default Aesthetic
                        </span>

                        <select
                            value={
                                defaultAestheticId
                            }
                            onChange={(
                                event
                            ) => {
                                setDefaultAestheticId(
                                    event.target.value
                                );

                                setSaved(
                                    false
                                );
                            }}
                            className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-black/20 px-4 text-sm text-zinc-300 outline-none focus:border-violet-500/35"
                        >
                            <option value="">
                                No default aesthetic
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
                    </label>

                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Used when a generation command
                        does not specify an aesthetic.
                    </p>
                </div>

                <div>
                    <label className="block">
                        <span className="text-xs font-medium text-zinc-500">
                            Default Mood
                        </span>

                        <select
                            value={
                                defaultMoodId
                            }
                            onChange={(
                                event
                            ) => {
                                setDefaultMoodId(
                                    event.target.value
                                );

                                setSaved(
                                    false
                                );
                            }}
                            className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-black/20 px-4 text-sm text-zinc-300 outline-none focus:border-violet-500/35"
                        >
                            <option value="">
                                No default mood
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
                    </label>

                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Used when a generation command
                        does not specify a mood.
                    </p>
                </div>

                <div>
                    <label className="block">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                            <Hash
                                size={13}
                            />

                            Generation Channel
                        </span>

                        <input
                            value={
                                generationChannelId
                            }
                            onChange={(
                                event
                            ) => {
                                setGenerationChannelId(
                                    event.target.value
                                );

                                setSaved(
                                    false
                                );
                            }}
                            placeholder="123456789012345678"
                            inputMode="numeric"
                            className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-black/20 px-4 font-mono text-sm text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-violet-500/35"
                        />
                    </label>

                    <p className="mt-2 text-xs leading-5 text-zinc-600">
                        Leave blank to allow generation
                        commands in any channel.
                    </p>
                </div>
            </div>

            {error && (
                <p className="mt-5 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm text-red-400">
                    {
                        error
                    }
                </p>
            )}

            <div className="mt-7 flex items-center justify-end gap-3 border-t border-white/[0.05] pt-5">
                {saved && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
                        <Check
                            size={15}
                        />

                        Saved
                    </span>
                )}

                <button
                    type="button"
                    onClick={
                        saveSettings
                    }
                    disabled={
                        saving
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                >
                    <Save
                        size={16}
                    />

                    {saving
                        ? "Saving..."
                        : "Save Settings"}
                </button>
            </div>
        </section>
    );
}
