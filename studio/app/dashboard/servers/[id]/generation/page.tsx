import {
    ArrowLeft,
    Bot,
    Crown,
    ShieldCheck,
    Sparkles,
} from "lucide-react";

import ServerSettings from "../../../../../components/servers/ServerSettings";
import ServerStudioNav from "../../../../../components/servers/ServerStudioNav";

import {
    getServerStudioContext,
} from "../../../../../lib/serverStudio";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function GenerationPage({
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
                active="generation"
            />

            <div className="mt-8 flex items-start gap-4">
                <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400">
                    <Sparkles
                        size={
                            21
                        }
                    />
                </div>

                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Generation
                    </p>

                    <h2 className="mt-2 text-2xl font-bold tracking-tight">
                        Generation Settings
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                        Configure the default aesthetic,
                        default mood, and where Aesthetic King
                        generation commands can be used.
                    </p>
                </div>
            </div>

            {installed ? (
                <div className="mt-6">
                    <ServerSettings
                        guildId={
                            guild.id
                        }
                        initialGenerationChannelId={
                            settings?.generationChannelId ??
                            null
                        }
                        initialDefaultAestheticId={
                            settings?.defaultAestheticId ??
                            null
                        }
                        initialDefaultMoodId={
                            settings?.defaultMoodId ??
                            null
                        }
                    />
                </div>
            ) : (
                <section className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
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
                                Discord server before changing
                                generation settings.
                            </p>
                        </div>
                    </div>
                </section>
            )}
        </>
    );
}
