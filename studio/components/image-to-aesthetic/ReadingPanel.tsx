"use client";

import { Check, Copy, Loader2, Save, Sparkles } from "lucide-react";

import { getR2AssetUrl } from "../../lib/r2Assets";
import type { AssetCatalogSet } from "../../lib/assetCatalog";
import type { ImageReading } from "../../lib/imageReader";

type Props = {
    reading: ImageReading | null;
    profileSet: AssetCatalogSet | null;
    r2PublicUrl: string;
    copied: string | null;
    onCopy: (value: string, key: string) => void | Promise<void>;
    saving: boolean;
    saved: boolean;
    readingBusy: boolean;
    onSave: () => void | Promise<void>;
    onRetry: () => void | Promise<void>;
};

/**
 * The right-hand column of the image-to-aesthetic studio: what the
 * model read out of the palette, plus the matched profile set.
 */
export default function ReadingPanel({
    reading,
    profileSet,
    r2PublicUrl,
    copied,
    onCopy,
    saving,
    saved,
    readingBusy,
    onSave,
    onRetry,
}: Props) {
    if (readingBusy) {
        return (
            <section className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-violet-300" />

                <p className="text-sm text-zinc-400">
                    Reading the aesthetic...
                </p>

                <p className="text-xs text-zinc-600">
                    Only your colors are sent, never the image.
                </p>
            </section>
        );
    }

    if (!reading) {
        return (
            <section className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded-3xl border border-white/[0.06] bg-[#101015] p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-zinc-600">
                    <Sparkles size={20} />
                </div>

                <p className="text-sm text-zinc-400">
                    Your reading shows up here
                </p>

                <p className="max-w-xs text-xs text-zinc-600">
                    Pick an image and we name the aesthetic, write
                    the profile, and match it to a set you can save.
                </p>
            </section>
        );
    }

    const banner = profileSet?.assets.banner
        ? getR2AssetUrl(r2PublicUrl, profileSet.assets.banner)
        : null;

    const pfp = profileSet?.assets.pfp
        ? getR2AssetUrl(r2PublicUrl, profileSet.assets.pfp)
        : null;

    return (
        <section className="space-y-4 rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex flex-wrap gap-2">
                <Tag
                    label="Aesthetic"
                    value={reading.aestheticId}
                    accent
                />
                {reading.moodId && (
                    <Tag
                        label="Mood"
                        value={reading.moodId}
                    />
                )}

                {reading.colorFilter && (
                    <Tag
                        label="Color"
                        value={reading.colorFilter}
                    />
                )}
                <Tag
                    label="Feel"
                    value={
                        reading.read.brightness +
                        " / " +
                        reading.read.intensity
                    }
                />
            </div>

            <div className="flex h-8 overflow-hidden rounded-lg border border-white/10">
                {reading.palette.map((hex) => (
                    <div
                        key={hex}
                        className="flex-1"
                        style={{ backgroundColor: hex }}
                        title={hex}
                    />
                ))}
            </div>

            <div className="space-y-3">
                <Field
                    label="Username"
                    value={reading.usernameIdea}
                    copied={copied === "username"}
                    onCopy={() =>
                        void onCopy(reading.usernameIdea, "username")
                    }
                />

                <Field
                    label="Bio"
                    value={reading.bio}
                    copied={copied === "bio"}
                    onCopy={() => void onCopy(reading.bio, "bio")}
                />

                {reading.status && (
                    <Field
                        label="Status"
                        value={reading.status}
                        copied={copied === "status"}
                        onCopy={() =>
                            void onCopy(
                                reading.status ?? "",
                                "status"
                            )
                        }
                    />
                )}

                <Field
                    label="Symbols"
                    value={reading.symbols.join(" ")}
                    copied={copied === "symbols"}
                    onCopy={() =>
                        void onCopy(
                            reading.symbols.join(" "),
                            "symbols"
                        )
                    }
                />
            </div>

            {(banner || pfp) && (
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-black/30">
                    <div className="h-24 w-full bg-white/[0.04]">
                        {banner && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={banner}
                                alt="Matched banner"
                                className="h-24 w-full object-cover"
                            />
                        )}
                    </div>

                    <div className="flex items-end gap-3 px-4 pb-4">
                        <div className="-mt-8 h-16 w-16 shrink-0 overflow-hidden rounded-full border-4 border-[#101015] bg-white/[0.06]">
                            {pfp && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={pfp}
                                    alt="Matched profile picture"
                                    className="h-full w-full object-cover"
                                />
                            )}
                        </div>

                        <div className="min-w-0 pb-1">
                            <p className="truncate text-sm font-semibold text-zinc-100">
                                {reading.usernameIdea}
                            </p>

                            <p className="truncate text-[11px] text-zinc-500">
                                Matched set #
                                {reading.profileSetId}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving || saved}
                    className="inline-flex items-center gap-2 rounded-xl bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saved ? (
                        <Check className="h-4 w-4 text-emerald-300" />
                    ) : saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    {saved ? "Saved" : "Save to my aesthetics"}
                </button>

                <button
                    type="button"
                    onClick={onRetry}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-50"
                >
                    <Sparkles className="h-4 w-4" />
                    Try again
                </button>
            </div>
        </section>
    );
}

function Tag({
    label,
    value,
    accent = false,
}: {
    label: string;
    value: string;
    accent?: boolean;
}) {
    return (
        <span
            className={[
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                accent
                    ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
                    : "border-white/[0.08] bg-white/[0.03] text-zinc-400",
            ].join(" ")}
        >
            <span className="text-zinc-600">{label}</span>
            <span className="font-semibold">{value}</span>
        </span>
    );
}

function Field({
    label,
    value,
    copied,
    onCopy,
}: {
    label: string;
    value: string;
    copied: boolean;
    onCopy: () => void;
}) {
    return (
        <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    {label}
                </p>

                <button
                    type="button"
                    onClick={onCopy}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-500 transition-colors hover:text-violet-300"
                >
                    {copied ? (
                        <Check className="h-3 w-3 text-emerald-300" />
                    ) : (
                        <Copy className="h-3 w-3" />
                    )}
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>

            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-zinc-100">
                {value}
            </p>
        </div>
    );
}
