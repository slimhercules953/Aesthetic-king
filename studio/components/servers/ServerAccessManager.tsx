"use client";

import {
    AlertTriangle,
    Hash,
    LoaderCircle,
    Plus,
    ShieldCheck,
    ShieldX,
    UserRound,
    X,
} from "lucide-react";

import {
    useMemo,
    useState,
} from "react";

import type {
    BotGuildChannel,
    BotGuildRole,
} from "../../lib/discordBot";

import type {
    AccessRule,
    AccessRuleEffect,
    AccessRuleKind,
} from "../../lib/guildAccessRules";

type ServerAccessManagerProps = {
    guildId: string;
    initialRules: AccessRule[];
    roles: BotGuildRole[];
    channels: BotGuildChannel[];
    directoryAvailable: boolean;
};

const EFFECTS: {
    value: AccessRuleEffect;
    label: string;
    hint: string;
}[] = [
    {
        value: "ALLOW",
        label: "Allow",
        hint: "Only these can use the bot",
    },
    {
        value: "DENY",
        label: "Block",
        hint: "These cannot, everyone else can",
    },
];

const KINDS: { value: AccessRuleKind; label: string }[] = [
    { value: "ROLE", label: "Role" },
    { value: "CHANNEL", label: "Channel" },
];

/**
 * Discord snowflakes are 17-20 digits. Anything else is a paste error, and
 * catching it here beats storing a rule that silently never matches.
 */
function isSnowflake(value: string): boolean {
    return /^\d{17,20}$/.test(value.trim());
}

function roleColor(color: number): string | undefined {
    if (!color) {
        return undefined;
    }

    return `#${color
        .toString(16)
        .padStart(6, "0")}`;
}

export default function ServerAccessManager({
    guildId,
    initialRules,
    roles,
    channels,
    directoryAvailable,
}: ServerAccessManagerProps) {
    const [rules, setRules] = useState(initialRules);

    const [effect, setEffect] =
        useState<AccessRuleEffect>("DENY");

    const [kind, setKind] =
        useState<AccessRuleKind>("ROLE");

    /** Either a picked snowflake or a hand-typed one. */
    const [targetId, setTargetId] = useState("");

    const [busy, setBusy] = useState(false);
    const [error, setError] =
        useState<string | null>(null);

    const targets = useMemo(
        () =>
            kind === "ROLE"
                ? roles.map((role) => ({
                    id: role.id,
                    name: role.name,
                }))
                : channels
                    .filter(
                        (channel) =>
                            channel.type !== 4
                    )
                    .map((channel) => ({
                        id: channel.id,
                        name: `#${channel.name}`,
                    })),
        [kind, roles, channels]
    );

    const labelsById = useMemo(() => {
        const map = new Map<string, string>();

        for (const role of roles) {
            map.set(role.id, role.name);
        }

        for (const channel of channels) {
            map.set(channel.id, `#${channel.name}`);
        }

        return map;
    }, [roles, channels]);

    const colorsById = useMemo(() => {
        const map = new Map<string, string>();

        for (const role of roles) {
            const color = roleColor(role.color);

            if (color) {
                map.set(role.id, color);
            }
        }

        return map;
    }, [roles]);

    const allowCount = rules.filter(
        (rule) => rule.effect === "ALLOW"
    ).length;

    const denyCount = rules.length - allowCount;

    /*
     * An allow rule anywhere flips the guild into allow-list mode, so
     * mixing the two effects is usually unintended. Warn rather than
     * forbid: a deny is still a legitimate carve-out from a broad allow.
     */
    const mixedEffects =
        allowCount > 0 && denyCount > 0;

    async function save(next: AccessRule[]) {
        const previous = rules;

        setRules(next);
        setBusy(true);
        setError(null);

        try {
            const response = await fetch(
                `/api/servers/${guildId}/access`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body: JSON.stringify({
                        rules: next.map((rule) => ({
                            kind: rule.kind,
                            effect: rule.effect,
                            targetId: rule.targetId,
                        })),
                    }),
                }
            );

            const body = await response.json() as {
                rules?: AccessRule[];
                error?: string;
            };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not save the access rules."
                );
            }

            setRules(body.rules ?? next);
        } catch (saveError) {
            setRules(previous);
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : "Could not save the access rules."
            );
        } finally {
            setBusy(false);
        }
    }

    function addRule() {
        const id = targetId.trim();

        if (!isSnowflake(id)) {
            setError(
                "Pick a role or channel from the list, or paste its numeric ID."
            );

            return;
        }

        if (
            rules.some(
                (rule) =>
                    rule.kind === kind &&
                    rule.targetId === id
            )
        ) {
            setError(
                "That role or channel already has a rule."
            );

            return;
        }

        setError(null);
        setTargetId("");

        void save([
            ...rules,
            {
                id: `${kind}:${id}`,
                kind,
                effect,
                targetId: id,
            },
        ]);
    }

    function removeRule(rule: AccessRule) {
        void save(
            rules.filter(
                (candidate) =>
                    !(
                        candidate.kind === rule.kind &&
                        candidate.targetId ===
                            rule.targetId
                    )
            )
        );
    }

    function labelFor(rule: AccessRule) {
        return (
            labelsById.get(rule.targetId) ??
            (rule.kind === "CHANNEL"
                ? `Channel ${rule.targetId}`
                : `Role ${rule.targetId}`)
        );
    }

    return (
        <div className="space-y-6">
            {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-300">
                    {error}
                </div>
            )}

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold tracking-tight">
                            Current Mode
                        </h3>

                        <p className="mt-1 text-sm leading-6 text-zinc-500">
                            {rules.length === 0
                                ? "No rules yet — everyone in this server can use the bot."
                                : allowCount > 0
                                    ? "Allow-list mode — only the allowed roles and channels can use the bot."
                                    : "Open with exceptions — the blocked roles and channels cannot use the bot."}
                        </p>
                    </div>

                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                            rules.length === 0
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                        }`}
                    >
                        <ShieldCheck size={13} />

                        {rules.length === 0
                            ? "Open to everyone"
                            : `${allowCount} allow • ${denyCount} block`}
                    </span>
                </div>

                {mixedEffects && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-200">
                        <AlertTriangle
                            size={14}
                            className="mt-0.5 shrink-0"
                        />

                        <span>
                            You have both allow and block
                            rules. Once any allow rule
                            exists, everyone not on the
                            allow list is already locked
                            out, so a block rule only
                            matters as an exception to a
                            broad allow.
                        </span>
                    </p>
                )}
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <h3 className="text-lg font-semibold tracking-tight">
                    Add A Rule
                </h3>

                {!directoryAvailable && (
                    <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-zinc-400">
                        <AlertTriangle
                            size={14}
                            className="mt-0.5 shrink-0"
                        />

                        <span>
                            The role and channel list is
                            unavailable, so type the
                            numeric ID instead. To get a
                            picker, set DISCORD_BOT_TOKEN
                            in the Studio environment.
                        </span>
                    </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex rounded-xl border border-white/[0.06] bg-[#0b0b0f] p-1">
                        {EFFECTS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                title={option.hint}
                                onClick={() =>
                                    setEffect(
                                        option.value
                                    )
                                }
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                    effect ===
                                    option.value
                                        ? option.value ===
                                          "DENY"
                                            ? "bg-red-500/15 text-red-300"
                                            : "bg-emerald-500/15 text-emerald-300"
                                        : "text-zinc-500 hover:text-zinc-300"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex rounded-xl border border-white/[0.06] bg-[#0b0b0f] p-1">
                        {KINDS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                    setKind(
                                        option.value
                                    )
                                }
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                    kind ===
                                    option.value
                                        ? "bg-violet-500/15 text-violet-300"
                                        : "text-zinc-500 hover:text-zinc-300"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    {directoryAvailable &&
                    targets.length > 0 ? (
                        <select
                            value={targetId}
                            onChange={(event) =>
                                setTargetId(
                                    event.target.value
                                )
                            }
                            className="min-w-56 flex-1 rounded-xl border border-white/[0.06] bg-[#0b0b0f] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/40"
                        >
                            <option value="">
                                Choose a{" "}
                                {kind === "ROLE"
                                    ? "role"
                                    : "channel"}
                                …
                            </option>

                            {targets.map((target) => (
                                <option
                                    key={target.id}
                                    value={target.id}
                                >
                                    {target.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            value={targetId}
                            onChange={(event) =>
                                setTargetId(
                                    event.target.value
                                )
                            }
                            placeholder="Paste a role or channel ID"
                            inputMode="numeric"
                            className="min-w-56 flex-1 rounded-xl border border-white/[0.06] bg-[#0b0b0f] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/40"
                        />
                    )}

                    <button
                        type="button"
                        onClick={addRule}
                        disabled={
                            busy || !targetId.trim()
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {busy ? (
                            <LoaderCircle
                                size={15}
                                className="animate-spin"
                            />
                        ) : (
                            <Plus size={15} />
                        )}

                        Add rule
                    </button>
                </div>
            </section>

            <section className="rounded-2xl border border-white/[0.06] bg-[#101015] p-6">
                <h3 className="text-lg font-semibold tracking-tight">
                    Rules
                </h3>

                {rules.length === 0 ? (
                    <p className="mt-3 text-sm leading-6 text-zinc-500">
                        No rules. The bot responds to every
                        member in every channel.
                    </p>
                ) : (
                    <ul className="mt-4 space-y-2">
                        {rules.map((rule) => (
                            <li
                                key={`${rule.kind}:${rule.targetId}`}
                                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#0b0b0f] px-4 py-3"
                            >
                                {rule.effect ===
                                "DENY" ? (
                                    <ShieldX
                                        size={16}
                                        className="shrink-0 text-red-400"
                                    />
                                ) : (
                                    <ShieldCheck
                                        size={16}
                                        className="shrink-0 text-emerald-400"
                                    />
                                )}

                                {rule.kind ===
                                "ROLE" ? (
                                    <UserRound
                                        size={14}
                                        className="shrink-0"
                                        style={{
                                            color:
                                                colorsById.get(
                                                    rule.targetId
                                                ) ??
                                                undefined,
                                        }}
                                    />
                                ) : (
                                    <Hash
                                        size={14}
                                        className="shrink-0 text-zinc-600"
                                    />
                                )}

                                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                                    {labelFor(rule)}
                                </span>

                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                        rule.effect ===
                                        "DENY"
                                            ? "bg-red-500/10 text-red-300"
                                            : "bg-emerald-500/10 text-emerald-300"
                                    }`}
                                >
                                    {rule.effect ===
                                    "DENY"
                                        ? "Blocked"
                                        : "Allowed"}
                                </span>

                                <button
                                    type="button"
                                    onClick={() =>
                                        removeRule(
                                            rule
                                        )
                                    }
                                    disabled={busy}
                                    aria-label={`Remove ${labelFor(rule)}`}
                                    className="shrink-0 rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.04] hover:text-red-300 disabled:opacity-40"
                                >
                                    <X size={15} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
