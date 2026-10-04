"use client";

import {
    ImageOff,
    LoaderCircle,
    RotateCcw,
    Save,
    Upload,
    UserRound,
} from "lucide-react";

import {
    useEffect,
    useRef,
    useState,
} from "react";

type BotIdentity = {
    userId: string;
    nick: string | null;
    avatarHash: string | null;
    globalAvatarHash: string | null;
    username: string;
    avatarUrl: string | null;
};

type IdentityResponse = {
    identity?: BotIdentity | null;
    error?: string;
};

/** Discord's own cap on a server nickname. */
const MAX_NICK = 32;

/** Base64 inflates by ~33%, so this is roughly the 256 KB Discord accepts. */
const MAX_UPLOAD_BYTES = 256 * 1024;

const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/60";

/**
 * Reads a file as a `data:` URI.
 *
 * `FileReader` rather than `file.arrayBuffer()` + manual base64 because the
 * browser does the encoding in one step and the result is already in the
 * exact shape Discord's API wants.
 */
function readFileAsDataUri(
    file: File
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () =>
            resolve(String(reader.result ?? ""));

        reader.onerror = () =>
            reject(
                new Error(
                    "Could not read that image."
                )
            );

        reader.readAsDataURL(file);
    });
}

/**
 * The bot's server-specific nickname and avatar.
 *
 * Separate from {@link ServerAppearanceManager} on purpose: that form writes
 * to our database and saves optimistically, while this one writes straight to
 * Discord and has to wait for the answer. Sharing a save state between a
 * local write and a remote one is how you end up showing "saved" for a change
 * Discord rejected.
 */
export default function ServerBotIdentityManager({
    guildId,
}: {
    guildId: string;
}) {
    const [identity, setIdentity] =
        useState<BotIdentity | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] =
        useState<string | null>(null);

    const [nick, setNick] = useState("");

    /** A picked file waiting to be uploaded; null means "no change". */
    const [avatarDraft, setAvatarDraft] =
        useState<string | null>(null);

    const [clearAvatar, setClearAvatar] =
        useState(false);

    const [busy, setBusy] = useState(false);
    const [error, setError] =
        useState<string | null>(null);

    const [saved, setSaved] = useState(false);

    /**
     * The preview URL that failed to load, so a stale avatar hash shows the
     * placeholder instead of a broken-image icon. Comparing against the URL
     * rather than using a boolean means a newly uploaded avatar is retried
     * without having to reset anything.
     */
    const [brokenPreview, setBrokenPreview] =
        useState<string | null>(null);

    const fileInput =
        useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        let canceled = false;

        async function load() {
            try {
                const response = await fetch(
                    `/api/servers/${guildId}/bot-identity`
                );

                const body = (await response
                    .json()
                    .catch(() => ({}))) as
                    IdentityResponse;

                if (!response.ok) {
                    throw new Error(
                        body.error ??
                            "Could not load the bot's profile for this server."
                    );
                }

                if (canceled) {
                    return;
                }

                setIdentity(
                    body.identity ?? null
                );

                setNick(
                    body.identity?.nick ?? ""
                );
            } catch (loadFailure) {
                if (!canceled) {
                    setLoadError(
                        loadFailure instanceof Error
                            ? loadFailure.message
                            : "Could not load the bot's profile for this server."
                    );
                }
            } finally {
                if (!canceled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            canceled = true;
        };
    }, [guildId]);

    async function pickAvatar(
        file: File | undefined
    ) {
        setAvatarDraft(null);
        setError(null);

        if (!file) {
            return;
        }

        if (!file.type.startsWith("image/")) {
            setError("Choose an image file.");
            return;
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            setError(
                "That image is larger than 256 KB. Use a smaller one."
            );
            return;
        }

        try {
            setAvatarDraft(
                await readFileAsDataUri(file)
            );

            /*
             * Picking a new file supersedes "remove the avatar" — keeping
             * both would send contradictory instructions to Discord.
             */
            setClearAvatar(false);
        } catch (readFailure) {
            setError(
                readFailure instanceof Error
                    ? readFailure.message
                    : "Could not read that image."
            );
        }
    }

    async function save() {
        setBusy(true);
        setError(null);
        setSaved(false);

        const patch: Record<string, unknown> = {};

        /*
         * Only send what changed. Sending the nickname when it is unchanged
         * would needlessly require CHANGE_NICKNAME on a save that only
         * touched the avatar, and Discord answers 403 for the whole request
         * rather than skipping the field it could not apply.
         */
        if (nick.trim() !== (identity?.nick ?? "")) {
            patch.nick = nick.trim() || null;
        }

        if (avatarDraft) {
            patch.avatar = avatarDraft;
        } else if (clearAvatar) {
            patch.avatar = null;
        }

        if (Object.keys(patch).length === 0) {
            setBusy(false);
            return;
        }

        try {
            const response = await fetch(
                `/api/servers/${guildId}/bot-identity`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify(patch),
                }
            );

            const body = (await response
                .json()
                .catch(() => ({}))) as
                IdentityResponse;

            if (!response.ok) {
                throw new Error(
                    body.error ??
                        "Discord rejected that change."
                );
            }

            setIdentity(
                body.identity ?? null
            );

            setNick(
                body.identity?.nick ?? ""
            );

            setAvatarDraft(null);
            setClearAvatar(false);
            setSaved(true);

            window.setTimeout(
                () => setSaved(false),
                1800
            );
        } catch (saveFailure) {
            setError(
                saveFailure instanceof Error
                    ? saveFailure.message
                    : "Discord rejected that change."
            );
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-3 rounded-3xl border border-white/[0.06] bg-[#101015] p-8 text-sm text-zinc-500">
                <LoaderCircle
                    size={18}
                    className="animate-spin"
                />
                Loading the bot&rsquo;s server profile…
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6 text-sm text-zinc-500">
                {loadError}
            </div>
        );
    }

    if (!identity) {
        return (
            <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6 text-sm leading-6 text-zinc-500">
                The bot&rsquo;s profile is unavailable
                right now. It is usually either offline or
                missing from this server — reconnect it and
                reload to change its name and picture here.
            </div>
        );
    }

    const previewUrl =
        avatarDraft ?? identity.avatarUrl;

    const dirty =
        nick.trim() !== (identity.nick ?? "") ||
        avatarDraft !== null ||
        clearAvatar;

    return (
        <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-200">
                        Bot identity in this server
                    </h2>

                    <p className="mt-1.5 max-w-2xl text-xs leading-6 text-zinc-500">
                        A nickname and profile picture just
                        for this server. Leave either blank
                        to use the bot&rsquo;s global name
                        and picture.
                    </p>
                </div>

                <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                        Global name
                    </p>

                    <p className="mt-1 text-xs text-zinc-400">
                        {identity.username}
                    </p>
                </div>
            </div>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex flex-col items-center gap-3">
                    <div className="relative h-24 w-24 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0f]">
                        {previewUrl &&
                        !clearAvatar &&
                        previewUrl !== brokenPreview ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                                src={previewUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={() => {
                                    setBrokenPreview(
                                        previewUrl
                                    );
                                }}
                            />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-700">
                                <UserRound
                                    size={28}
                                />
                            </div>
                        )}
                    </div>

                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        aria-label="Choose a bot avatar"
                        className="hidden"
                        onChange={(event) => {
                            void pickAvatar(
                                event.target
                                    .files?.[0]
                            );

                            /*
                             * Lets the owner re-pick the same
                             * file after removing it, which a
                             * file input otherwise ignores.
                             */
                            event.target.value = "";
                        }}
                    />

                    <div className="flex flex-wrap justify-center gap-2">
                        <button
                            type="button"
                            onClick={() =>
                                fileInput.current?.click()
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-violet-500/60 hover:text-violet-300"
                        >
                            <Upload size={12} />
                            Upload
                        </button>

                        {(identity.avatarHash ||
                            avatarDraft) &&
                            !clearAvatar && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAvatarDraft(
                                            null
                                        );

                                        setClearAvatar(
                                            true
                                        );

                                        setError(null);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-zinc-400 transition hover:border-red-500/50 hover:text-red-300"
                                >
                                    <ImageOff size={12} />
                                    Remove
                                </button>
                            )}
                    </div>
                </div>

                <div className="min-w-0 flex-1 space-y-4">
                    <div>
                        <label
                            className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                            htmlFor="bot-nickname"
                        >
                            Server nickname
                        </label>

                        <input
                            id="bot-nickname"
                            className={inputClass}
                            value={nick}
                            maxLength={MAX_NICK}
                            placeholder={
                                identity.username
                            }
                            onChange={(event) => {
                                setNick(
                                    event.target.value
                                );

                                setError(null);
                            }}
                        />

                        <p className="mt-1.5 text-[11px] text-zinc-600">
                            {nick.trim().length}/
                            {MAX_NICK}
                            {" · "}
                            Blank uses the global name.
                            Changing it needs the
                            &ldquo;Change Nickname&rdquo;
                            permission.
                        </p>
                    </div>

                    {clearAvatar && (
                        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-xs text-zinc-400">
                            The server avatar will be
                            removed and the bot&rsquo;s
                            global picture used instead.
                        </p>
                    )}

                    {error && (
                        <p className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-2.5 text-xs text-red-300">
                            {error}
                        </p>
                    )}

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void save()}
                            disabled={
                                busy || !dirty
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-400/50 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy ? (
                                <LoaderCircle
                                    size={15}
                                    className="animate-spin"
                                />
                            ) : (
                                <Save size={15} />
                            )}

                            {busy
                                ? "Saving…"
                                : "Save to Discord"}
                        </button>

                        {dirty && !busy && (
                            <button
                                type="button"
                                onClick={() => {
                                    setNick(
                                        identity.nick ??
                                        ""
                                    );

                                    setAvatarDraft(null);
                                    setClearAvatar(false);
                                    setError(null);
                                }}
                                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
                            >
                                <RotateCcw size={15} />
                                Discard
                            </button>
                        )}

                        {saved && !dirty && (
                            <span className="text-xs text-emerald-400">
                                Saved
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
