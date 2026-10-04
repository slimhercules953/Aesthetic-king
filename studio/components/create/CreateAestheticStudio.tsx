"use client";

import {
    CircleUserRound,
    Copy,
    LoaderCircle,
    RefreshCw,
    Save,
    Sparkles,
    WandSparkles,
} from "lucide-react";

import {
    useRouter,
} from "next/navigation";

import {
    useState,
} from "react";

import {
    getR2AssetUrl,
} from "../../lib/r2Assets";

import UpgradePrompt from "../ui/UpgradePrompt";

import {
    readDeniedBody,
    type FeatureDeniedBody,
} from "../../lib/denied";

type Filters = {
    aesthetics: string[];
    moods: string[];
    colors: string[];
};

type GeneratedAesthetic = {
    generationId: string;

    aestheticId: string;
    moodId: string | null;
    colorFilter: string | null;

    profileSetId: string;

    usernameIdea: string;
    bio: string;
    status: string;

    symbols: string[];
    palette: string[];
};

type RegenerationTarget =
    | "username"
    | "bio"
    | "status"
    | "palette"
    | "symbols"
    | "profileSet";

type AssetSet = {
    id: string;

    assets: {
        pfp: string;
        banner: string;
    };
};

type Props = {
    filters: Filters;
    assetSets: AssetSet[];
    r2PublicUrl: string;
};

function titleCase(
    value: string
) {
    return value
        .split(/[-_]/)
        .map(
            (part) =>
                part
                    .charAt(0)
                    .toUpperCase() +
                part.slice(1)
        )
        .join(" ");
}

export default function CreateAestheticStudio({
    filters,
    assetSets,
    r2PublicUrl,
}: Props) {
    const router =
        useRouter();

    const [
        aestheticId,
        setAestheticId,
    ] = useState("");

    const [
        moodId,
        setMoodId,
    ] = useState("");

    const [
        colorFilter,
        setColorFilter,
    ] = useState("");

    const [
        request,
        setRequest,
    ] = useState("");

    const [
        result,
        setResult,
    ] = useState<
        GeneratedAesthetic | null
    >(null);

    const [
        generating,
        setGenerating,
    ] = useState(false);

    const [
        saving,
        setSaving,
    ] = useState(false);

    const [
        regenerating,
        setRegenerating,
    ] = useState<
        RegenerationTarget | null
    >(null);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    const [
        denied,
        setDenied,
    ] = useState<
        FeatureDeniedBody | null
    >(null);

    const profileSet =
        result
            ? assetSets.find(
                  (set) =>
                      set.id ===
                      result.profileSetId
              ) ?? null
            : null;

    async function generate() {
        if (
            !aestheticId ||
            generating
        ) {
            return;
        }

        setGenerating(true);
        setError(null);
        setDenied(null);

        try {
            const response =
                await fetch(
                    "/api/aesthetics/generate",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                aestheticId,

                                moodId:
                                    moodId ||
                                    null,

                                colorFilter:
                                    colorFilter ||
                                    null,

                                request:
                                    request ||
                                    null,
                            }),
                    }
                );

            const body =
                await response.json() as {
                    aesthetic?:
                        GeneratedAesthetic;

                    error?: string;
                };

            if (
                !response.ok ||
                !body.aesthetic
            ) {
                const refusal =
                    readDeniedBody(
                        response.status,
                        body
                    );

                if (refusal) {
                    setDenied(refusal);
                    return;
                }

                throw new Error(
                    body.error ||
                        "Unable to generate aesthetic."
                );
            }

            setResult(
                body.aesthetic
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
            setGenerating(false);
        }
    }

    async function regenerate(
        target:
            RegenerationTarget
    ) {
        if (
            !result ||
            regenerating
        ) {
            return;
        }

        setRegenerating(
            target
        );

        setError(null);
        setDenied(null);

        try {
            const response =
                await fetch(
                    "/api/aesthetics/regenerate",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                target,

                                aestheticId:
                                    result.aestheticId,

                                moodId:
                                    moodId ||
                                    null,

                                colorFilter:
                                    colorFilter ||
                                    null,

                                request:
                                    request ||
                                    null,

                                profileSetId:
                                    result.profileSetId,

                                usernameIdea:
                                    result.usernameIdea,

                                bio:
                                    result.bio,

                                status:
                                    result.status,

                                symbols:
                                    result.symbols,

                                palette:
                                    result.palette,
                            }),
                    }
                );

            const body =
                await response.json() as {
                    update?: Partial<
                        GeneratedAesthetic
                    >;

                    error?: string;
                };

            if (
                !response.ok ||
                !body.update
            ) {
                const refusal =
                    readDeniedBody(
                        response.status,
                        body
                    );

                if (refusal) {
                    setDenied(refusal);
                    return;
                }

                throw new Error(
                    body.error ||
                        "Unable to regenerate."
                );
            }

            setResult(
                (
                    current
                ) =>
                    current
                        ? {
                              ...current,
                              ...body.update,
                          }
                        : current
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
            setRegenerating(
                null
            );
        }
    }

    async function save() {
        if (
            !result ||
            saving
        ) {
            return;
        }

        setSaving(true);
        setError(null);
        setDenied(null);

        try {
            const response =
                await fetch(
                    "/api/aesthetics",
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                ...result,

                                name:
                                    `${titleCase(
                                        result.aestheticId
                                    )}${
                                        result.moodId
                                            ? ` • ${titleCase(
                                                  result.moodId
                                              )}`
                                            : ""
                                    }${
                                        result.colorFilter
                                            ? ` • ${titleCase(
                                                  result.colorFilter
                                              )}`
                                            : ""
                                    }`,
                            }),
                    }
                );

            const body =
                await response.json() as {
                    aesthetic?: {
                        id: string;
                    };

                    error?: string;
                };

            if (
                !response.ok ||
                !body.aesthetic
            ) {
                const refusal =
                    readDeniedBody(
                        response.status,
                        body
                    );

                if (refusal) {
                    setDenied(refusal);
                    setSaving(false);
                    return;
                }

                throw new Error(
                    body.error ||
                        "Unable to save aesthetic."
                );
            }

            router.push(
                `/dashboard/aesthetics/${body.aesthetic.id}`
            );
        } catch (
            caughtError
        ) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );

            setSaving(false);
        }
    }

    async function copy(
        value: string
    ) {
        await navigator.clipboard.writeText(
            value
        );
    }

    return (
        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
            <section className="self-start rounded-3xl border border-white/[0.06] bg-[#101015] p-6 xl:sticky xl:top-6">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                        Creator
                    </p>

                    <h2 className="mt-2 text-2xl font-semibold">
                        Build your aesthetic
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-zinc-500">
                        Choose a style and optionally narrow it by mood, color, or your own creative direction.
                    </p>
                </div>

                <div className="mt-7 space-y-5">
                    <label className="block">
                        <span className="text-xs font-medium text-zinc-500">
                            Aesthetic *
                        </span>

                        <select
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
                            className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-[#0c0c11] px-4 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
                        >
                            <option value="">
                                Choose aesthetic
                            </option>

                            {filters.aesthetics.map(
                                (
                                    value
                                ) => (
                                    <option
                                        key={
                                            value
                                        }
                                        value={
                                            value
                                        }
                                    >
                                        {titleCase(
                                            value
                                        )}
                                    </option>
                                )
                            )}
                        </select>
                    </label>

                    <label className="block">
                        <span className="text-xs font-medium text-zinc-500">
                            Mood
                        </span>

                        <select
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
                            className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-[#0c0c11] px-4 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
                        >
                            <option value="">
                                Any mood
                            </option>

                            {filters.moods.map(
                                (
                                    value
                                ) => (
                                    <option
                                        key={
                                            value
                                        }
                                        value={
                                            value
                                        }
                                    >
                                        {titleCase(
                                            value
                                        )}
                                    </option>
                                )
                            )}
                        </select>
                    </label>

                    <label className="block">
                        <span className="text-xs font-medium text-zinc-500">
                            Color
                        </span>

                        <select
                            value={
                                colorFilter
                            }
                            onChange={(
                                event
                            ) =>
                                setColorFilter(
                                    event
                                        .target
                                        .value
                                )
                            }
                            className="mt-2 h-12 w-full rounded-xl border border-white/[0.07] bg-[#0c0c11] px-4 text-sm text-zinc-300 outline-none focus:border-violet-500/40"
                        >
                            <option value="">
                                Any color
                            </option>

                            {filters.colors.map(
                                (
                                    value
                                ) => (
                                    <option
                                        key={
                                            value
                                        }
                                        value={
                                            value
                                        }
                                    >
                                        {titleCase(
                                            value
                                        )}
                                    </option>
                                )
                            )}
                        </select>
                    </label>

                    <label className="block">
                        <span className="text-xs font-medium text-zinc-500">
                            Creative direction
                        </span>

                        <textarea
                            value={
                                request
                            }
                            onChange={(
                                event
                            ) =>
                                setRequest(
                                    event
                                        .target
                                        .value
                                )
                            }
                            maxLength={
                                500
                            }
                            rows={5}
                            placeholder="Dark vampire-inspired profile, elegant rather than edgy..."
                            className="mt-2 w-full resize-none rounded-xl border border-white/[0.07] bg-[#0c0c11] p-4 text-sm leading-6 text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-violet-500/40"
                        />

                        <span className="mt-2 block text-right text-[10px] text-zinc-600">
                            {
                                request.length
                            }
                            /500
                        </span>
                    </label>
                </div>

                {error && (
                    <p className="mt-5 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm leading-6 text-red-400">
                        {
                            error
                        }
                    </p>
                )}

                {denied && (
                    <UpgradePrompt
                        denied={denied}
                        className="mt-5"
                    />
                )}

                <button
                    type="button"
                    onClick={
                        generate
                    }
                    disabled={
                        !aestheticId ||
                        generating ||
                        Boolean(
                            regenerating
                        )
                    }
                    className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                >
                    {generating ? (
                        <LoaderCircle
                            size={17}
                            className="animate-spin"
                        />
                    ) : (
                        <WandSparkles
                            size={17}
                        />
                    )}

                    {generating
                        ? "Creating..."
                        : result
                        ? "Generate Again"
                        : "Generate Aesthetic"}
                </button>
            </section>

            <section>
                {!result ? (
                    <div className="flex min-h-[620px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                            <Sparkles
                                size={27}
                            />
                        </div>

                        <h2 className="mt-5 text-xl font-semibold">
                            Your aesthetic will appear here
                        </h2>

                        <p className="mt-2 max-w-md text-sm leading-6 text-zinc-600">
                            Choose an aesthetic on the left and generate a complete matching Discord profile concept.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <section className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                            {profileSet ? (
                                <div className="relative h-56 overflow-hidden bg-zinc-900">
                                    <img
                                        src={getR2AssetUrl(
                                            r2PublicUrl,
                                            profileSet
                                                .assets
                                                .banner
                                        )}
                                        alt={`Profile Set ${profileSet.id} banner`}
                                        className="h-full w-full object-cover"
                                    />

                                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#101015] to-transparent" />
                                </div>
                            ) : (
                                <div className="h-56 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/[0.05]" />
                            )}

                            <div className="relative px-7 pb-7 pt-16">
                                {profileSet ? (
                                    <div className="absolute -top-12 left-7 h-24 w-24 overflow-hidden rounded-full border-4 border-[#101015] bg-zinc-900 shadow-xl">
                                        <img
                                            src={getR2AssetUrl(
                                                r2PublicUrl,
                                                profileSet
                                                    .assets
                                                    .pfp
                                            )}
                                            alt={`Profile Set ${profileSet.id} PFP`}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="absolute -top-12 left-7 flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#101015] bg-violet-500">
                                        <CircleUserRound
                                            size={
                                                35
                                            }
                                        />
                                    </div>
                                )}

                                <p className="font-mono text-xl font-semibold">
                                    {
                                        result.usernameIdea
                                    }
                                </p>

                                <p className="mt-2 text-sm text-zinc-400">
                                    {
                                        result.status
                                    }
                                </p>

                                <p className="mt-6 max-w-2xl text-sm leading-7 text-zinc-300">
                                    {
                                        result.bio
                                    }
                                </p>

                                <div className="mt-6 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-violet-500/15 bg-violet-500/[0.06] px-3 py-1.5 text-xs text-violet-300">
                                        {titleCase(
                                            result.aestheticId
                                        )}
                                    </span>

                                    {result.moodId && (
                                        <span className="rounded-full border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-500">
                                            {titleCase(
                                                result.moodId
                                            )}
                                        </span>
                                    )}

                                    {result.colorFilter && (
                                        <span className="rounded-full border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-500">
                                            {titleCase(
                                                result.colorFilter
                                            )}
                                        </span>
                                    )}

                                    <span className="rounded-full border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-600">
                                        Set{" "}
                                        {
                                            result.profileSetId
                                        }
                                    </span>
                                </div>

                                <div className="mt-5">
                                    <RegenerateButton
                                        label="New Profile Set"
                                        target="profileSet"
                                        regenerating={
                                            regenerating
                                        }
                                        onRegenerate={
                                            regenerate
                                        }
                                    />
                                </div>
                            </div>
                        </section>

                        <div className="grid gap-5 md:grid-cols-2">
                            <ResultField
                                title="Username"
                                value={
                                    result.usernameIdea
                                }
                                onCopy={
                                    copy
                                }
                                regenerateTarget="username"
                                regenerating={
                                    regenerating
                                }
                                onRegenerate={
                                    regenerate
                                }
                            />

                            <ResultField
                                title="Status"
                                value={
                                    result.status
                                }
                                onCopy={
                                    copy
                                }
                                regenerateTarget="status"
                                regenerating={
                                    regenerating
                                }
                                onRegenerate={
                                    regenerate
                                }
                            />
                        </div>

                        <ResultField
                            title="Bio"
                            value={
                                result.bio
                            }
                            onCopy={
                                copy
                            }
                            multiline
                            regenerateTarget="bio"
                            regenerating={
                                regenerating
                            }
                            onRegenerate={
                                regenerate
                            }
                        />

                        <div className="grid gap-5 md:grid-cols-2">
                            <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                        Palette
                                    </p>

                                    <RegenerateButton
                                        label="New Palette"
                                        target="palette"
                                        regenerating={
                                            regenerating
                                        }
                                        onRegenerate={
                                            regenerate
                                        }
                                    />
                                </div>

                                <div className="mt-4 flex h-14 overflow-hidden rounded-xl border border-white/[0.06]">
                                    {result.palette.map(
                                        (
                                            color,
                                            index
                                        ) => (
                                            <div
                                                key={`${color}-${index}`}
                                                title={
                                                    color
                                                }
                                                className="flex-1"
                                                style={{
                                                    backgroundColor:
                                                        color,
                                                }}
                                            />
                                        )
                                    )}
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    {result.palette.map(
                                        (
                                            color,
                                            index
                                        ) => (
                                            <span
                                                key={`${color}-${index}`}
                                                className="font-mono text-xs text-zinc-600"
                                            >
                                                {
                                                    color
                                                }
                                            </span>
                                        )
                                    )}
                                </div>
                            </section>

                            <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                        Symbols
                                    </p>

                                    <RegenerateButton
                                        label="New Symbols"
                                        target="symbols"
                                        regenerating={
                                            regenerating
                                        }
                                        onRegenerate={
                                            regenerate
                                        }
                                    />
                                </div>

                                <p className="mt-6 text-3xl tracking-[0.25em] text-zinc-300">
                                    {result.symbols.join(
                                        " "
                                    )}
                                </p>
                            </section>
                        </div>

                        <div className="flex flex-col gap-3 rounded-3xl border border-violet-500/15 bg-violet-500/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="font-semibold">
                                    Happy with this aesthetic?
                                </p>

                                <p className="mt-1 text-sm text-zinc-500">
                                    Save it to your Studio library so you can organize and revisit it later.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={
                                    save
                                }
                                disabled={
                                    saving ||
                                    generating ||
                                    Boolean(
                                        regenerating
                                    )
                                }
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-40"
                            >
                                {saving ? (
                                    <LoaderCircle
                                        size={
                                            16
                                        }
                                        className="animate-spin"
                                    />
                                ) : (
                                    <Save
                                        size={
                                            16
                                        }
                                    />
                                )}

                                {saving
                                    ? "Saving..."
                                    : "Save Aesthetic"}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}

function RegenerateButton({
    label,
    target,
    regenerating,
    onRegenerate,
}: {
    label: string;
    target: RegenerationTarget;
    regenerating:
        RegenerationTarget | null;

    onRegenerate: (
        target:
            RegenerationTarget
    ) => Promise<void>;
}) {
    const busy =
        regenerating ===
        target;

    return (
        <button
            type="button"
            disabled={
                Boolean(
                    regenerating
                )
            }
            onClick={() =>
                onRegenerate(
                    target
                )
            }
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-zinc-500 transition hover:border-violet-500/20 hover:text-violet-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {busy ? (
                <LoaderCircle
                    size={13}
                    className="animate-spin"
                />
            ) : (
                <RefreshCw
                    size={13}
                />
            )}

            {busy
                ? "Generating..."
                : label}
        </button>
    );
}

function ResultField({
    title,
    value,
    onCopy,
    multiline = false,
    regenerateTarget,
    regenerating,
    onRegenerate,
}: {
    title: string;
    value: string;

    onCopy: (
        value: string
    ) => Promise<void>;

    multiline?: boolean;

    regenerateTarget?:
        | "username"
        | "bio"
        | "status";

    regenerating?:
        RegenerationTarget | null;

    onRegenerate?: (
        target:
            RegenerationTarget
    ) => Promise<void>;
}) {
    return (
        <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    {
                        title
                    }
                </p>

                <div className="flex items-center gap-2">
                    {regenerateTarget &&
                        onRegenerate && (
                        <RegenerateButton
                            label={`New ${title}`}
                            target={
                                regenerateTarget
                            }
                            regenerating={
                                regenerating ??
                                null
                            }
                            onRegenerate={
                                onRegenerate
                            }
                        />
                    )}

                    <button
                        type="button"
                        onClick={() =>
                            onCopy(
                                value
                            )
                        }
                        className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                        <Copy
                            size={15}
                        />
                    </button>
                </div>
            </div>

            <p
                className={[
                    "mt-4 text-zinc-300",
                    multiline
                        ? "whitespace-pre-wrap text-sm leading-7"
                        : "font-mono text-sm",
                ].join(
                    " "
                )}
            >
                {
                    value
                }
            </p>
        </section>
    );
}
