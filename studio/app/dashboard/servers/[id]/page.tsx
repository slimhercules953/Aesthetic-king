import {
    ArrowLeft,
    Bot,
    Boxes,
    CheckCircle2,
    ChevronRight,
    Command,
    Crown,
    LockKeyhole,
    Palette,
    ShieldCheck,
    Sparkles,
    TrendingUp,
} from "lucide-react";

import ServerStudioNav from "../../../../components/servers/ServerStudioNav";

import {
    getServerStudioContext,
} from "../../../../lib/serverStudio";

import {
    getGuildAppearance,
    type GuildAppearance,
} from "../../../../lib/guildAppearance";

import {
    getAccessRules,
    type AccessRule,
} from "../../../../lib/guildAccessRules";

import {
    getServerAestheticPacks,
    type ServerAestheticPack,
} from "../../../../lib/aestheticPacks";

import {
    getGuildAnalytics,
    type GuildAnalytics,
} from "../../../../lib/guildAnalytics";

import {
    getGuildCommandSettings,
} from "../../../../lib/commandSettings";

import {
    SERVER_MANAGEABLE_COMMANDS,
} from "../../../../lib/serverCommands";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function ServerPage({
    params,
}: PageProps) {
    const {
        id,
    } =
        await params;

    const {
        guild,
        installed,
        settings,
        iconUrl,
    } =
        await getServerStudioContext(
            id
        );

    /*
     * A step stays ticked once it has been completed, even if the admin
     * later clears the value. The `setup*Done` flags are stamped by the
     * API when a step is first configured; the `Boolean(...)` fallback
     * keeps a value that was set before those columns existed from
     * reading as unfinished.
     */
    const generationConfigured =
        Boolean(
            settings?.generationChannelId
        ) ||
        Boolean(
            settings?.setupGenerationDone
        );

    const aestheticConfigured =
        Boolean(
            settings?.defaultAestheticId
        ) ||
        Boolean(
            settings?.setupAestheticDone
        );

    const moodConfigured =
        Boolean(
            settings?.defaultMoodId
        ) ||
        Boolean(
            settings?.setupMoodDone
        );

    const configuredCount =
        [
            installed,
            generationConfigured,
            aestheticConfigured,
            moodConfigured,
        ].filter(Boolean).length;

    /*
     * Every tab is live now, so the Overview reads their state instead of
     * labeling them "Planned". One round trip, and each loader already
     * returns a harmless empty value for a guild that has not configured
     * the area yet.
     */
    const [
        appearance,
        accessRules,
        packs,
        commandSettings,
        analytics,
    ]: [
        GuildAppearance | null,
        AccessRule[],
        ServerAestheticPack[],
        Record<string, boolean>,
        GuildAnalytics | null,
    ] = installed
        ? await Promise.all([
              getGuildAppearance(id),
              getAccessRules(id),
              getServerAestheticPacks(id),
              getGuildCommandSettings(id),
              getGuildAnalytics(id, 30),
          ])
        : [null, [], [], {}, null];

    const disabledCommands =
        SERVER_MANAGEABLE_COMMANDS.filter(
            (command) =>
                commandSettings[
                    command.name
                ] === false
        ).length;

    const allowRules = accessRules.filter(
        (rule) => rule.effect === "ALLOW"
    ).length;

    const denyRules =
        accessRules.length - allowRules;

    const appearanceCustomized =
        Boolean(
            appearance?.embedColor ||
            appearance?.footerText
        ) ||
        appearance?.showPackBadge === false ||
        appearance?.showGeneratedImages === false ||
        appearance?.showRerollButtons === false;

    return (
        <>
            <a
                href="/dashboard/servers"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft
                    size={16}
                />

                My Servers
            </a>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-center gap-5">
                    {iconUrl ? (
                        <img
                            src={
                                iconUrl
                            }
                            alt=""
                            className="h-20 w-20 shrink-0 rounded-3xl object-cover"
                        />
                    ) : (
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/[0.06] bg-[#101015] text-2xl font-bold text-zinc-300">
                            {guild.name
                                .charAt(
                                    0
                                )
                                .toUpperCase()}
                        </div>
                    )}

                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                            Server Studio
                        </p>

                        <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">
                            {
                                guild.name
                            }
                        </h1>

                        <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
                                {guild.owner ? (
                                    <Crown
                                        size={
                                            13
                                        }
                                    />
                                ) : (
                                    <ShieldCheck
                                        size={
                                            13
                                        }
                                    />
                                )}

                                {guild.owner
                                    ? "Owner"
                                    : "Manager"}
                            </span>

                            {installed ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                                    <Bot
                                        size={
                                            13
                                        }
                                    />
                                    Connected
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-400">
                                    <Bot
                                        size={
                                            13
                                        }
                                    />
                                    Not Installed
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <ServerStudioNav
                guildId={
                    guild.id
                }
                active="overview"
            />

            <div className="mt-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                    Overview
                </p>

                <h2 className="mt-2 text-2xl font-bold tracking-tight">
                    Server configuration
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                    Manage how Aesthetic King behaves,
                    generates content, and integrates with
                    this Discord server.
                </p>
            </div>

            <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                            <CheckCircle2
                                size={
                                    18
                                }
                            />
                        </div>

                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                Setup
                            </p>

                            <h3 className="mt-1 font-semibold">
                                Server setup progress
                            </h3>
                        </div>
                    </div>

                    <div className="text-left sm:text-right">
                        <p className="text-2xl font-bold text-zinc-200">
                            {
                                configuredCount
                            }
                            /4
                        </p>

                        <p className="text-xs text-zinc-600">
                            core settings configured
                        </p>
                    </div>
                </div>

                <div className="mt-6 h-2 overflow-hidden rounded-full bg-zinc-900">
                    <div
                        className="h-full rounded-full bg-violet-500 transition-all"
                        style={{
                            width: `${(configuredCount / 4) * 100}%`,
                        }}
                    />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <SetupItem
                        complete={
                            installed
                        }
                        label="Aesthetic King installed"
                    />

                    <SetupItem
                        complete={
                            generationConfigured
                        }
                        label="Generation channel configured"
                    />

                    <SetupItem
                        complete={
                            aestheticConfigured
                        }
                        label="Default aesthetic configured"
                    />

                    <SetupItem
                        complete={
                            moodConfigured
                        }
                        label="Default mood configured"
                    />
                </div>
            </section>

            <div className="mt-8 flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold">
                        Current Configuration
                    </h2>

                    <p className="mt-1 text-sm text-zinc-600">
                        Your server&apos;s active Aesthetic
                        King defaults.
                    </p>
                </div>

                {installed && (
                    <a
                        href={`/dashboard/servers/${guild.id}/generation`}
                        className="text-sm font-medium text-violet-400 transition hover:text-violet-300"
                    >
                        Edit Generation
                    </a>
                )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
                <ConfigurationCard
                    icon={
                        <Sparkles
                            size={
                                18
                            }
                        />
                    }
                    label="Default Aesthetic"
                    value={
                        settings?.defaultAestheticId
                            ? formatSettingName(
                                  settings.defaultAestheticId
                              )
                            : "Not configured"
                    }
                    configured={
                        aestheticConfigured
                    }
                />

                <ConfigurationCard
                    icon={
                        <Palette
                            size={
                                18
                            }
                        />
                    }
                    label="Default Mood"
                    value={
                        settings?.defaultMoodId
                            ? formatSettingName(
                                  settings.defaultMoodId
                              )
                            : "Not configured"
                    }
                    configured={
                        moodConfigured
                    }
                />

                <ConfigurationCard
                    icon={
                        <Command
                            size={
                                18
                            }
                        />
                    }
                    label="Generation Channel"
                    value={
                        settings?.generationChannelId
                            ? `#${settings.generationChannelId}`
                            : "Not configured"
                    }
                    configured={
                        generationConfigured
                    }
                />
            </div>

            <div className="mt-10">
                <h2 className="text-lg font-semibold">
                    Server Studio
                </h2>

                <p className="mt-1 text-sm text-zinc-600">
                    Configure and customize Aesthetic King
                    for this server.
                </p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <StudioAreaCard
                    icon={
                        <Sparkles
                            size={
                                19
                            }
                        />
                    }
                    title="Generation"
                    description="Configure generation channels and your server's default aesthetic and mood."
                    href={`/dashboard/servers/${guild.id}/generation`}
                    status="Available"
                    detail={
                        generationConfigured
                            ? `Generation locked to #${settings?.generationChannelId}`
                            : "Any channel can generate"
                    }
                />

                <StudioAreaCard
                    icon={
                        <Command
                            size={
                                19
                            }
                        />
                    }
                    title="Commands"
                    description="Control which Aesthetic King commands are available in your server."
                    href={`/dashboard/servers/${guild.id}/commands`}
                    status="Available"
                    detail={
                        disabledCommands > 0
                            ? `${disabledCommands} command${disabledCommands === 1 ? "" : "s"} turned off`
                            : "All commands enabled"
                    }
                />

                <StudioAreaCard
                    icon={
                        <Boxes
                            size={
                                19
                            }
                        />
                    }
                    title="Aesthetic Packs"
                    description="Create coordinated aesthetic presets for your Discord community."
                    href={`/dashboard/servers/${guild.id}/packs`}
                    status="Available"
                    detail={
                        packs.length > 0
                            ? `${packs.length} pack${packs.length === 1 ? "" : "s"} created`
                            : "No packs yet"
                    }
                />

                <StudioAreaCard
                    icon={
                        <Palette
                            size={
                                19
                            }
                        />
                    }
                    title="Appearance"
                    description="Customize embed color, footer, and which controls appear under a result."
                    href={`/dashboard/servers/${guild.id}/appearance`}
                    status="Available"
                    detail={
                        appearanceCustomized
                            ? "Customized"
                            : "Bot defaults"
                    }
                />

                <StudioAreaCard
                    icon={
                        <LockKeyhole
                            size={
                                19
                            }
                        />
                    }
                    title="Access"
                    description="Control which channels and roles can access Aesthetic King features."
                    href={`/dashboard/servers/${guild.id}/access`}
                    status="Available"
                    detail={
                        accessRules.length === 0
                            ? "Open to everyone"
                            : allowRules > 0
                              ? `Allow list • ${allowRules} rule${allowRules === 1 ? "" : "s"}`
                              : `${denyRules} blocked`
                    }
                />

                <StudioAreaCard
                    icon={
                        <TrendingUp
                            size={
                                19
                            }
                        />
                    }
                    title="Analytics"
                    description="Understand how your community uses Aesthetic King."
                    href={`/dashboard/servers/${guild.id}/analytics`}
                    status="Available"
                    detail={
                        analytics &&
                        analytics.summary.totalEvents >
                            0
                            ? `${analytics.summary.totalEvents} generations in 30 days`
                            : "No activity recorded yet"
                    }
                />
            </div>

            {!installed && (
                <section className="mt-10 rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-zinc-900 p-2.5 text-zinc-500">
                            <Bot
                                size={
                                    20
                                }
                            />
                        </div>

                        <div>
                            <h2 className="font-semibold">
                                Aesthetic King is not installed
                            </h2>

                            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
                                Install Aesthetic King in this
                                Discord server before configuring
                                Server Studio features.
                            </p>
                        </div>
                    </div>
                </section>
            )}
        </>
    );
}

function SetupItem({
    complete,
    label,
}: {
    complete: boolean;
    label: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-black/10 px-4 py-3">
            <div
                className={
                    complete
                        ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
                        : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-700"
                }
            >
                <CheckCircle2
                    size={
                        15
                    }
                />
            </div>

            <span
                className={
                    complete
                        ? "text-sm text-zinc-300"
                        : "text-sm text-zinc-600"
                }
            >
                {label}
            </span>
        </div>
    );
}

function ConfigurationCard({
    icon,
    label,
    value,
    configured,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    configured: boolean;
}) {
    return (
        <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-5">
            <div className="flex items-center justify-between">
                <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                    {icon}
                </div>

                <span
                    className={
                        configured
                            ? "text-xs font-medium text-emerald-400"
                            : "text-xs font-medium text-zinc-600"
                    }
                >
                    {configured
                        ? "Configured"
                        : "Not set"}
                </span>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                {label}
            </p>

            <p
                className={
                    configured
                        ? "mt-2 truncate text-lg font-semibold text-zinc-200"
                        : "mt-2 truncate text-lg font-semibold text-zinc-600"
                }
            >
                {value}
            </p>
        </div>
    );
}

function StudioAreaCard({
    icon,
    title,
    description,
    href,
    status,
    detail,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    href?: string;
    status: string;
    detail?: string;
}) {
    const content = (
        <>
            <div className="flex items-start justify-between gap-4">
                <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                    {icon}
                </div>

                <span
                    className={
                        status === "Available"
                            ? "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400"
                            : "rounded-full border border-white/[0.05] bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-600"
                    }
                >
                    {status}
                </span>
            </div>

            <h3 className="mt-5 font-semibold text-zinc-200">
                {title}
            </h3>

            <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-600">
                {description}
            </p>

            {detail && (
                <p className="mt-3 text-xs text-zinc-500">
                    {detail}
                </p>
            )}

            <div
                className={
                    href
                        ? "mt-5 flex items-center gap-1 text-sm font-medium text-violet-400"
                        : "mt-5 flex items-center gap-1 text-sm font-medium text-zinc-600"
                }
            >
                {href
                    ? "Open"
                    : status}

                <ChevronRight
                    size={
                        15
                    }
                />
            </div>
        </>
    );

    if (href) {
        return (
            <a
                href={
                    href
                }
                className="rounded-3xl border border-white/[0.06] bg-[#101015] p-5 transition hover:border-violet-500/20 hover:bg-[#121218]"
            >
                {content}
            </a>
        );
    }

    return (
        <div className="rounded-3xl border border-white/[0.06] bg-[#101015] p-5">
            {content}
        </div>
    );
}

function formatSettingName(
    value: string
) {
    return value
        .split("-")
        .map(
            (part) =>
                part.charAt(
                    0
                ).toUpperCase() +
                part.slice(
                    1
                )
        )
        .join(" ");
}
