"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
    Check,
    Copy,
    Loader2,
    Sparkles,
    Trash2,
    Upload,
} from "lucide-react";

import UpgradePrompt from "../ui/UpgradePrompt";
import ReadingPanel from "./ReadingPanel";
import {
    readDeniedBody,
    type FeatureDeniedBody,
} from "../../lib/denied";
import { getAssetSetById } from "../../lib/assetCatalog";
import {
    contrastRatio,
    extractColorsFromFile,
    type SampledColor,
} from "../../lib/imageColor";
import type { ImageReading } from "../../lib/imageReader";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const COLOR_COUNT = 5;

/**
 * Upload an image, get the aesthetic behind it.
 *
 * Sampling happens in the browser so the server never touches image
 * bytes: the user sees the real palette before spending anything, and
 * the model only ever receives a handful of hex codes.
 */
export default function ImageToAestheticStudio({
    r2PublicUrl,
}: {
    r2PublicUrl: string;
}) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    const [preview, setPreview] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [sampled, setSampled] = useState<SampledColor[]>([]);
    const [request, setRequest] = useState("");
    const [sampling, setSampling] = useState(false);
    const [reading, setReading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [readingResult, setReadingResult] =
        useState<ImageReading | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [denied, setDenied] = useState<FeatureDeniedBody | null>(
        null
    );
    const [saved, setSaved] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);

    // Populations are shares of every sampled pixel, so the handful of
    // colours we keep rarely add to 1 - a gradient scatters across
    // thousands of buckets. The bar is drawn relative to what we kept,
    // which is what a reader expects it to show.
    const sampledTotal = sampled.reduce(
        (sum, color) => sum + color.population,
        0
    ) || 1;

    function swatchTitle(color: SampledColor) {
        return (
            color.hex +
            " - " +
            Math.round((color.population / sampledTotal) * 100) +
            "% of this palette"
        );
    }

    function reset() {
        setPreview(null);
        setFileName(null);
        setSampled([]);
        setReadingResult(null);
        setSaved(false);
        setError(null);
        setDenied(null);

        if (inputRef.current) {
            inputRef.current.value = "";
        }
    }

    async function handleFile(file: File) {
        if (!ACCEPTED.includes(file.type)) {
            setError(
                "That file type is not supported. Use a JPEG, PNG or WebP."
            );
            return;
        }

        if (file.size > MAX_BYTES) {
            setError(
                "That file is " +
                    (file.size / 1024 / 1024).toFixed(1) +
                    " MB. Keep it under 8 MB."
            );
            return;
        }

        setError(null);
        setDenied(null);
        setReadingResult(null);
        setSaved(false);
        setFileName(file.name);
        setPreview(URL.createObjectURL(file));
        setSampled([]);
        setSampling(true);

        try {
            const colors = await extractColorsFromFile(
                file,
                COLOR_COUNT
            );

            setSampled(colors);
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : "That image could not be read."
            );
        } finally {
            setSampling(false);
        }
    }

    async function read() {
        if (sampled.length < 3 || reading) {
            return;
        }

        setReading(true);
        setError(null);
        setDenied(null);
        setReadingResult(null);
        setSaved(false);

        try {
            const response = await fetch(
                "/api/image-to-aesthetic",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        palette: sampled.map(
                            (color) => color.hex
                        ),
                        request: request.trim() || undefined,
                    }),
                }
            );

            const payload = await response
                .json()
                .catch(() => null);

            if (!response.ok) {
                const denial = readDeniedBody(
                    response.status,
                    payload
                );

                if (denial) {
                    setDenied(denial);
                    return;
                }

                setError(
                    (
                        payload as { error?: string } | null
                    )?.error ??
                    "That image could not be read. Try again."
                );

                return;
            }

            setReadingResult(
                (payload as { reading: ImageReading }).reading
            );
        } catch {
            setError("Could not reach Aesthetic King. Try again.");
        } finally {
            setReading(false);
        }
    }

    async function save() {
        if (!readingResult || saving) {
            return;
        }

        setSaving(true);
        setError(null);
        setDenied(null);

        try {
            const response = await fetch("/api/aesthetics", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    generationId:
                        readingResult.generationId,
                    name: readingResult.aestheticId,
                    aestheticId: readingResult.aestheticId,
                    moodId: readingResult.moodId,
                    colorFilter: readingResult.colorFilter,
                    profileSetId: readingResult.profileSetId,
                    usernameIdea:
                        readingResult.usernameIdea,
                    bio: readingResult.bio,
                    status: readingResult.status,
                    symbols: readingResult.symbols,
                    palette: readingResult.palette,
                }),
            });

            const payload = await response
                .json()
                .catch(() => null);

            if (!response.ok) {
                const denial = readDeniedBody(
                    response.status,
                    payload
                );

                if (denial) {
                    setDenied(denial);
                    return;
                }

                setError(
                    (
                        payload as { error?: string } | null
                    )?.error ?? "Could not save that aesthetic."
                );

                return;
            }

            setSaved(true);
            router.refresh();
        } catch {
            setError("Could not save that aesthetic.");
        } finally {
            setSaving(false);
        }
    }

    async function copy(value: string, key: string) {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(key);
            window.setTimeout(() => setCopied(null), 1500);
        } catch {
            setCopied(null);
        }
    }

    const profileSet = readingResult
        ? getAssetSetById(readingResult.profileSetId)
        : null;

    const canRead = sampled.length >= 3 && !sampling;

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPTED.join(",")}
                    className="hidden"
                    onChange={(event) => {
                        const file =
                            event.target.files?.[0];

                        if (file) {
                            void handleFile(file);
                        }
                    }}
                />

                <div
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);

                        const file =
                            event.dataTransfer.files?.[0];

                        if (file) {
                            void handleFile(file);
                        }
                    }}
                    onClick={() => inputRef.current?.click()}
                    className={[
                        "cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
                        dragging
                            ? "border-violet-400/60 bg-violet-500/10"
                            : "border-white/[0.08] hover:border-violet-400/40 hover:bg-white/[0.02]",
                    ].join(" ")}
                >
                    {preview ? (
                        <div className="space-y-4">
                            <div className="mx-auto max-h-64 overflow-hidden rounded-xl bg-black/40">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={preview}
                                    alt={
                                        fileName ??
                                        "Uploaded image"
                                    }
                                    className="mx-auto max-h-64 w-auto object-contain"
                                />
                            </div>

                            <p className="truncate text-xs text-zinc-500">
                                {fileName}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 py-8">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
                                <Upload size={20} />
                            </div>

                            <p className="text-sm font-medium text-zinc-200">
                                Drop an image, or click to choose
                                one
                            </p>

                            <p className="mx-auto max-w-xs text-xs text-zinc-500">
                                JPEG, PNG or WebP up to 8 MB. The
                                picture stays in your browser -
                                only its colours are sent.
                            </p>
                        </div>
                    )}
                </div>

                {sampling && (
                    <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Sampling colours...
                    </p>
                )}

                {sampled.length > 0 && (
                    <div className="mt-6">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Sampled from your image
                        </p>

                        <div className="mt-3 flex gap-2">
                            {sampled.map((color) => (
                                <button
                                    key={color.hex}
                                    type="button"
                                    onClick={() =>
                                        void copy(
                                            color.hex,
                                            color.hex
                                        )
                                    }
                                    title={swatchTitle(color)}
                                    className="group relative h-16 flex-1 overflow-hidden rounded-xl border border-white/10"
                                    style={{
                                        backgroundColor:
                                            color.hex,
                                    }}
                                >
                                    <span
                                        className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-[9px] font-semibold tracking-wide opacity-0 transition-opacity group-hover:opacity-100"
                                        style={{
                                            color:
                                                contrastRatio(
                                                    color.hex,
                                                    "#000000"
                                                ) >
                                                contrastRatio(
                                                    color.hex,
                                                    "#ffffff"
                                                )
                                                    ? "#000"
                                                    : "#fff",
                                        }}
                                    >
                                        {copied === color.hex
                                            ? "Copied"
                                            : color.hex}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-white/5">
                            {sampled.map((color) => (
                                <span
                                    key={`bar-${color.hex}`}
                                    title={swatchTitle(color)}
                                    style={{
                                        width: `${
                                            (color.population /
                                                sampledTotal) *
                                            100
                                        }%`,
                                        backgroundColor:
                                            color.hex,
                                    }}
                                />
                            ))}
                        </div>

                        <p className="mt-2 text-[11px] text-zinc-600">
                            Click a colour to copy it. Hover for
                            how much of your image each one
                            covers.
                        </p>
                    </div>
                )}

                <div className="mt-6">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                        Anything specific? (optional)
                    </label>

                    <input
                        value={request}
                        onChange={(event) =>
                            setRequest(event.target.value)
                        }
                        maxLength={500}
                        placeholder="make it feel like a rainy night"
                        className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-400/50"
                    />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={read}
                        disabled={!canRead || reading}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {reading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Sparkles className="h-4 w-4" />
                        )}
                        {reading
                            ? "Reading..."
                            : "Read the aesthetic"}
                    </button>

                    {(preview || request) && (
                        <button
                            type="button"
                            onClick={reset}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                        >
                            <Trash2 className="h-4 w-4" />
                            Clear
                        </button>
                    )}
                </div>

                {error && (
                    <p className="mt-4 text-xs text-rose-300">
                        {error}
                    </p>
                )}

                {denied && (
                    <UpgradePrompt
                        denied={denied}
                        onUnlocked={read}
                        className="mt-5"
                    />
                )}
            </section>

            <ReadingPanel
                reading={readingResult}
                profileSet={profileSet}
                r2PublicUrl={r2PublicUrl}
                copied={copied}
                onCopy={copy}
                saving={saving}
                saved={saved}
                readingBusy={reading}
                onSave={save}
                onRetry={read}
            />
        </div>
    );
}
