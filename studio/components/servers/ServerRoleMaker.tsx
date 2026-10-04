"use client";

import {
    AlertTriangle,
    Check,
    LoaderCircle,
    Plus,
    Sparkles,
    Trash2,
} from "lucide-react";

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    contrastRatio,
    isValidHex,
} from "../../lib/imageColor";

type RoleRecord = {
    id: string;
    discordRoleId: string;
    name: string;
    color: string;
    createdAt: string;
};

type RoleToolState = {
    status: {
        canRead: boolean;
        canManageRoles: boolean | null;
    };
    roles: RoleRecord[];
    inviteUrl: string | null;
};

/** Discord's own cap on a role name. */
const MAX_NAME = 100;

/*
 * Every preset clears 4.5:1 against Discord's dark theme, so the maker never
 * opens on a colour it is about to warn about. The lighter end of each hue is
 * deliberate: the brand violets and reds that look right in the dashboard
 * (violet-500, red-500) are the ones that go muddy on a dark member list.
 */
const PRESET_COLORS = [
    "#A78BFA",
    "#4ADE80",
    "#FBBF24",
    "#F87171",
    "#38BDF8",
    "#F472B6",
    "#FACC15",
    "#2DD4BF",
];

const DEFAULT_COLOR = "#A78BFA";

/** Discord's dark and light message backgrounds. */
const DARK_BG = "#313338";
const LIGHT_BG = "#F2F3F5";

/** WCAG AA for normal text, the bar `roleColorReadability` uses. */
const MIN_CONTRAST = 4.5;

const inputClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#0b0b0f] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/60";

function normalizeHex(value: string): string | null {
    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    const candidate = trimmed.startsWith("#")
        ? trimmed
        : `#${trimmed}`;

    return isValidHex(candidate)
        ? candidate.toUpperCase()
        : null;
}

/**
 * Coloured role names, on both Discord themes.
 *
 * The only honest preview: a color that looks fine on dark is frequently
 * invisible on light, and the owner needs to see that before the whole server
 * does.
 */
function RolePreview({
    name,
    color,
}: {
    name: string;
    color: string;
}) {
    const label = name.trim() || "new role";

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {[
                {
                    background: DARK_BG,
                    caption: "Dark theme",
                    muted: "rgba(234,238,245,0.55)",
                },
                {
                    background: LIGHT_BG,
                    caption: "Light theme",
                    muted: "rgba(79,84,92,0.8)",
                },
            ].map((theme) => (
                <div
                    key={theme.caption}
                    className="rounded-xl p-3.5"
                    style={{
                        background: theme.background,
                    }}
                >
                    <p
                        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{ color: theme.muted }}
                    >
                        {theme.caption}
                    </p>

                    <p className="mt-2 flex items-center gap-2">
                        <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: color }}
                        />

                        <span
                            className="truncate text-sm font-medium"
                            style={{ color }}
                        >
                            {label}
                        </span>
                    </p>

                    <p
                        className="mt-1.5 truncate text-xs"
                        style={{ color: theme.muted }}
                    >
                        {label} just said something
                    </p>
                </div>
            ))}
        </div>
    );
}

/**
 * Creates cosmetic roles — a coloured name, nothing else.
 *
 * Deliberately separate from {@link ServerAppearanceManager}: that form writes
 * to our database and saves optimistically, while this one creates something
 * real on Discord and has to wait for the answer. It is also separate from
 * {@link ServerBotIdentityManager} because a role is a server object the owner
 * keeps afterwards, not a setting we can revert for them.
 */
export default function ServerRoleMaker({
    guildId,
}: {
    guildId: string;
}) {
    const [state, setState] =
        useState<RoleToolState | null>(null);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] =
        useState<string | null>(null);

    const [name, setName] = useState("");
    const [hexText, setHexText] =
        useState(DEFAULT_COLOR);

    const [busy, setBusy] = useState(false);
    const [error, setError] =
        useState<string | null>(null);

    const [created, setCreated] =
        useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await fetch(
                `/api/servers/${guildId}/roles`
            );

            const body = (await response
                .json()
                .catch(() => ({}))) as
                RoleToolState & { error?: string };

            if (!response.ok) {
                throw new Error(
                    body.error ??
                        "Could not load the roles for this server."
                );
            }

            setState(body);
        } catch (loadFailure) {
            setLoadError(
                loadFailure instanceof Error
                    ? loadFailure.message
                    : "Could not load the roles for this server."
            );
        } finally {
            setLoading(false);
        }
    }, [guildId]);

    useEffect(() => {
        void load();
    }, [load]);

    const color = useMemo(
        () => normalizeHex(hexText),
        [hexText]
    );

    const readability = useMemo(() => {
        if (!color) {
            return null;
        }

        const onDark = contrastRatio(
            color,
            DARK_BG
        );

        const onLight = contrastRatio(
            color,
            LIGHT_BG
        );

        return {
            onDark,
            onLight,
            /*
             * Matches `roleColorReadability` on the server. If the two drift
             * apart the preview warns about colors the API is happy with, or
             * stays quiet about ones it dislikes.
             */
            readable:
                onDark >= MIN_CONTRAST ||
                onLight >= MIN_CONTRAST,
        };
    }, [color]);

    async function createRole() {
        if (!color) {
            setError(
                "Use a six-digit hex color like #C084FC."
            );

            return;
        }

        setBusy(true);
        setError(null);
        setCreated(null);

        try {
            const response = await fetch(
                `/api/servers/${guildId}/roles`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        name: name.trim(),
                        color,
                    }),
                }
            );

            const body = (await response
                .json()
                .catch(() => ({}))) as {
                role?: { name: string };
                state?: RoleToolState;
                error?: string;
            };

            if (!response.ok) {
                throw new Error(
                    body.error ??
                        "Discord rejected that role."
                );
            }

            if (body.state) {
                setState(body.state);
            }

            setCreated(
                body.role?.name ?? "new role"
            );

            setName("");
        } catch (createFailure) {
            setError(
                createFailure instanceof Error
                    ? createFailure.message
                    : "Discord rejected that role."
            );
        } finally {
            setBusy(false);
        }
    }

    async function forget(recordId: string) {
        setBusy(true);
        setError(null);

        try {
            const response = await fetch(
                `/api/servers/${guildId}/roles?record=${encodeURIComponent(recordId)}`,
                { method: "DELETE" }
            );

            const body = (await response
                .json()
                .catch(() => ({}))) as
                RoleToolState & { error?: string };

            if (!response.ok) {
                throw new Error(
                    body.error ??
                        "Could not remove that role entry."
                );
            }

            setState(body);
        } catch (removeFailure) {
            setError(
                removeFailure instanceof Error
                    ? removeFailure.message
                    : "Could not remove that role entry."
            );
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#101015] p-8 text-sm text-zinc-500">
                <LoaderCircle
                    size={18}
                    className="animate-spin"
                />
                Loading role tools…
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6 text-sm text-zinc-500">
                {loadError}
            </div>
        );
    }

    const status = state?.status ?? {
        canRead: false,
        canManageRoles: null,
    };

    const inviteUrl = state?.inviteUrl ?? null;

    return (
        <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight">
                        Role Maker
                    </h3>

                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-500">
                        Turn a hex code into a coloured role
                        name. The role grants no permissions,
                        cannot be mentioned and does not
                        hoist anyone — it is decoration only.
                        Assign it to members from Discord.
                    </p>
                </div>

                <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                    <Sparkles size={18} />
                </div>
            </div>

            {!status.canRead && (
                <div className="mt-5 rounded-2xl border border-white/[0.06] bg-[#0b0b0f] p-4 text-sm leading-6 text-zinc-500">
                    The bot could not be reached in this
                    server, so roles cannot be created right
                    now. Make sure Aesthetic King is still a
                    member and reload.
                </div>
            )}

            {status.canRead &&
                status.canManageRoles === false && (
                    <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle
                                size={16}
                                className="mt-0.5 shrink-0 text-amber-400"
                            />

                            <div className="min-w-0">
                                <p className="text-sm font-medium text-amber-200">
                                    Aesthetic King is missing
                                    Manage Roles
                                </p>

                                <p className="mt-1 text-xs leading-6 text-amber-200/70">
                                    Use the invite link once
                                    and approve the updated
                                    permission list. Nothing
                                    else about the bot
                                    changes.
                                </p>

                                {inviteUrl && (
                                    <a
                                        href={inviteUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10"
                                    >
                                        Update permissions
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            {status.canRead &&
                status.canManageRoles !== false && (
                    <div className="mt-6 space-y-5">
                        {error && (
                            <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">
                                {error}
                            </div>
                        )}

                        {created && (
                            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4 text-sm text-emerald-300">
                                <Check size={16} />
                                Created &ldquo;{created}
                                &rdquo;. Assign it from
                                Discord&rsquo;s member list.
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <label
                                    className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                                    htmlFor="role-name"
                                >
                                    Role name
                                </label>

                                <input
                                    id="role-name"
                                    className={inputClass}
                                    value={name}
                                    maxLength={MAX_NAME}
                                    placeholder="aesthetic"
                                    onChange={(event) => {
                                        setName(
                                            event.target
                                                .value
                                        );

                                        setError(null);
                                        setCreated(null);
                                    }}
                                />

                                <p className="mt-1.5 text-[11px] text-zinc-600">
                                    {name.trim().length}/
                                    {MAX_NAME}
                                </p>
                            </div>

                            <div>
                                <label
                                    className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
                                    htmlFor="role-hex"
                                >
                                    Hex color
                                </label>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={
                                            color ??
                                            DEFAULT_COLOR
                                        }
                                        onChange={(event) => {
                                            setHexText(
                                                event.target.value.toUpperCase()
                                            );

                                            setError(
                                                null
                                            );

                                            setCreated(
                                                null
                                            );
                                        }}
                                        className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                                        aria-label="Role color picker"
                                    />

                                    <input
                                        id="role-hex"
                                        className={inputClass}
                                        value={hexText}
                                        maxLength={7}
                                        placeholder="#7C5CFF"
                                        spellCheck={false}
                                        onChange={(event) => {
                                            setHexText(
                                                event.target.value
                                            );

                                            setError(
                                                null
                                            );

                                            setCreated(
                                                null
                                            );
                                        }}
                                    />
                                </div>

                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {PRESET_COLORS.map(
                                        (preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                title={preset}
                                                onClick={() => {
                                                    setHexText(
                                                        preset
                                                    );

                                                    setError(
                                                        null
                                                    );
                                                }}
                                                className={`h-6 w-6 rounded-md border transition ${
                                                    color?.toLowerCase() ===
                                                    preset.toLowerCase()
                                                        ? "border-white/60"
                                                        : "border-white/10 hover:border-white/30"
                                                }`}
                                                style={{
                                                    background:
                                                        preset,
                                                }}
                                            />
                                        )
                                    )}
                                </div>
                            </div>
                        </div>

                        {color && (
                            <div className="space-y-2">
                                <RolePreview
                                    name={name}
                                    color={color}
                                />

                                {readability &&
                                    !readability.readable && (
                                        <p className="text-xs leading-6 text-amber-300/80">
                                            That color is hard
                                            to read against
                                            both Discord
                                            themes. Try
                                            something
                                            brighter.
                                        </p>
                                    )}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() =>
                                    void createRole()
                                }
                                disabled={
                                    busy ||
                                    !color ||
                                    !name.trim()
                                }
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy ? (
                                    <LoaderCircle
                                        size={16}
                                        className="animate-spin"
                                    />
                                ) : (
                                    <Plus size={16} />
                                )}
                                Create role
                            </button>

                            <span className="text-xs text-zinc-600">
                                Roles are created in Discord
                                and stay there.
                            </span>
                        </div>
                    </div>
                )}

            {(state?.roles.length ?? 0) > 0 && (
                <div className="mt-7 border-t border-white/[0.06] pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Created here
                    </p>

                    <ul className="mt-3 space-y-2">
                        {state?.roles.map((role) => (
                            <li
                                key={role.id}
                                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0b0b0f] px-3.5 py-2.5"
                            >
                                <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{
                                        background:
                                            role.color,
                                    }}
                                />

                                <span
                                    className="min-w-0 flex-1 truncate text-sm font-medium"
                                    style={{
                                        color: role.color,
                                    }}
                                >
                                    {role.name}
                                </span>

                                <span className="shrink-0 text-[11px] text-zinc-600">
                                    {new Date(
                                        role.createdAt
                                    ).toLocaleDateString()}
                                </span>

                                <button
                                    type="button"
                                    onClick={() =>
                                        void forget(
                                            role.id
                                        )
                                    }
                                    disabled={busy}
                                    title="Remove this entry (does not delete the role in Discord)"
                                    className="shrink-0 rounded-lg border border-white/[0.08] p-1.5 text-zinc-500 transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
