"use client";

import {
    Check,
    ImageOff,
    LoaderCircle,
    RotateCcw,
    Save,
    Sparkles,
    Tag,
} from "lucide-react";

import {
    useEffect,
    useState,
} from "react";

type Appearance = {
    embedColor: string | null;
    footerText: string | null;
    showPackBadge: boolean;
    showGeneratedImages: boolean;
    showRerollButtons: boolean;
};

const DEFAULT_COLOR = "#7C5CFF";

const PRESET_COLORS = [
    "#7C5CFF",
    "#22C55E",
    "#F59E0B",
    "#EF4444",
    "#06B6D4",
    "#EC4899",
    "#FACC15",
    "#14B8A6",
];

type ServerAppearanceManagerProps = {
    guildId: string;
};

type SaveState =
    | "idle"
    | "saving"
    | "saved"
    | "error";

/**
 * The form is uncontrolled-ish by design: each control saves itself on
 * change rather than filling a shared "save" button. The API is a partial
 * PATCH, so a half-filled form can never overwrite a field the owner did not
 * touch — which matters most when two people have the tab open.
 */
export default function ServerAppearanceManager({
    guildId,
}: ServerAppearanceManagerProps) {
    const [appearance, setAppearance] =
        useState<Appearance | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] =
        useState<string | null>(null);

    const [saveState, setSaveState] =
        useState<SaveState>("idle");

    const [saveError, setSaveError] =
        useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch(
                    `/api/servers/${guildId}/appearance`
                );

                const body = await response.json() as {
                    appearance?: Appearance;
                    error?: string;
                };

                if (!response.ok) {
                    throw new Error(
                        body.error ||
                            "Could not load the server appearance."
                    );
                }

                if (!cancelled) {
                    setAppearance(
                        body.appearance ?? null
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    setLoadError(
                        error instanceof Error
                            ? error.message
                            : "Could not load the server appearance."
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [guildId]);

    async function save(
        patch: Partial<Appearance>
    ) {
        if (!appearance) {
            return;
        }

        const optimistic = {
            ...appearance,
            ...patch,
        };

        setAppearance(optimistic);
        setSaveState("saving");
        setSaveError(null);

        try {
            const response = await fetch(
                `/api/servers/${guildId}/appearance`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(patch),
                }
            );

            const body = await response.json() as {
                appearance?: Appearance;
                error?: string;
            };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not save that change."
                );
            }

            /*
             * Trust the server's copy: it is the one that normalised the hex
             * to `#rrggbb` and truncated the footer, so echoing it back keeps
             * the preview honest about what the bot will actually render.
             */
            setAppearance(
                body.appearance ?? optimistic
            );

            setSaveState("saved");

            window.setTimeout(() => {
                setSaveState("idle");
            }, 1800);
        } catch (error) {
            setAppearance(appearance);
            setSaveState("error");
            setSaveError(
                error instanceof Error
                    ? error.message
                    : "Could not save that change."
            );
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#101015] p-8 text-sm text-zinc-500">
                <LoaderCircle
                    size={18}
                    className="animate-spin"
                />
                Loading appearance settings…
            </div>
        );
    }

    if (loadError || !appearance) {
        return (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6 text-sm text-red-300">
                {loadError ??
                    "Could not load the server appearance."}
            </div>
        );
    }

    const color =
        appearance.embedColor ?? DEFAULT_COLOR;

    return (
        <div className="space-y-6">
            {saveError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">
                    {saveError}
                </div>
            )}

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-semibold tracking-tight">
                            Embed Color
                        </h3>

                        <p className="mt-1 text-sm text-zinc-500">
                            The accent bar and heading color
                            on every reply.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <span
                            className="h-9 w-9 rounded-xl border border-white/10"
                            style={{
                                backgroundColor: color,
                            }}
                        />

                        <input
                            type="color"
                            value={color}
                            onChange={(event) =>
                                save({
                                    embedColor:
                                        event.target.value,
                                })
                            }
                            className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                            aria-label="Embed color"
                        />
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                    {PRESET_COLORS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() =>
                                save({
                                    embedColor: preset,
                                })
                            }
                            className={`h-8 w-8 rounded-lg border transition ${
                                color.toLowerCase() ===
                                preset.toLowerCase()
                                    ? "border-white/60"
                                    : "border-white/10 hover:border-white/30"
                            }`}
                            style={{
                                backgroundColor: preset,
                            }}
                            aria-label={`Use ${preset}`}
                        />
                    ))}

                    <button
                        type="button"
                        onClick={() =>
                            save({
                                embedColor: null,
                            })
                        }
                        className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-zinc-400 transition hover:border-white/30 hover:text-zinc-200"
                    >
                        <RotateCcw size={12} />
                        Default
                    </button>
                </div>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                        <Tag size={17} />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold tracking-tight">
                            Footer Text
                        </h3>

                        <p className="mt-1 text-sm text-zinc-500">
                            Shown at the bottom of every
                            embed. Leave it empty to keep the
                            default &quot;Aesthetic King&quot;
                            footer.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <input
                                type="text"
                                defaultValue={
                                    appearance.footerText ??
                                    ""
                                }
                                key={
                                    appearance.footerText ??
                                    ""
                                }
                                maxLength={120}
                                placeholder="Aesthetic King"
                                onBlur={(event) => {
                                    const value =
                                        event.target.value;

                                    if (
                                        (value.trim() ||
                                            null) !==
                                        appearance.footerText
                                    ) {
                                        save({
                                            footerText:
                                                value,
                                        });
                                    }
                                }}
                                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0B0B0F] px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/50"
                            />

                            <span className="text-xs text-zinc-600">
                                {(
                                    appearance.footerText ??
                                    ""
                                ).length}
                                /120
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <h3 className="text-lg font-semibold tracking-tight">
                    What Appears In A Reply
                </h3>

                <p className="mt-1 text-sm text-zinc-500">
                    Turn parts of the result off if they get
                    in the way in this server.
                </p>

                <div className="mt-5 space-y-3">
                    <ToggleRow
                        icon={Sparkles}
                        title="Aesthetic Pack badge"
                        description="Shows which Pack produced the result, when one was used."
                        checked={
                            appearance.showPackBadge
                        }
                        onChange={(value) =>
                            save({
                                showPackBadge: value,
                            })
                        }
                    />

                    <ToggleRow
                        icon={ImageOff}
                        title="Generated images"
                        description="Attach the generated profile image to the reply. Turning this off keeps the text only."
                        checked={
                            appearance.showGeneratedImages
                        }
                        onChange={(value) =>
                            save({
                                showGeneratedImages: value,
                            })
                        }
                    />

                    <ToggleRow
                        icon={RotateCcw}
                        title="Reroll and save buttons"
                        description="The controls under a result. Disable them if members keep rerolling someone else's post."
                        checked={
                            appearance.showRerollButtons
                        }
                        onChange={(value) =>
                            save({
                                showRerollButtons: value,
                            })
                        }
                    />
                </div>
            </section>

            <div className="flex items-center gap-3 text-sm">
                <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                        saveState === "saved"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : saveState === "saving"
                              ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
                              : "border-white/[0.06] text-zinc-600"
                    }`}
                >
                    {saveState === "saving" ? (
                        <LoaderCircle
                            size={13}
                            className="animate-spin"
                        />
                    ) : saveState === "saved" ? (
                        <Check size={13} />
                    ) : (
                        <Save size={13} />
                    )}

                    {saveState === "saving"
                        ? "Saving…"
                        : saveState === "saved"
                          ? "Saved"
                          : "Changes save as you change them"}
                </span>
            </div>
        </div>
    );
}

function ToggleRow({
    icon: Icon,
    title,
    description,
    checked,
    onChange,
}: {
    icon: typeof Sparkles;
    title: string;
    description: string;
    checked: boolean;
    onChange: (value: boolean) => void;
}) {
    return (
        <label className="flex cursor-pointer items-start gap-4 rounded-xl border border-white/[0.06] bg-[#0B0B0F] p-4 transition hover:border-white/[0.12]">
            <div className="rounded-lg bg-white/[0.04] p-2 text-zinc-400">
                <Icon size={16} />
            </div>

            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200">
                    {title}
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500">
                    {description}
                </p>
            </div>

            <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                    onChange(event.target.checked)
                }
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-violet-500"
            />
        </label>
    );
}
