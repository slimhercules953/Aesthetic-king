import {
    dashboardMetadata,
} from "../../../../../lib/pageMetadata";

import {
    ArrowLeft,
    Bot,
    Boxes,
    Crown,
    ShieldCheck,
} from "lucide-react";

import {
    notFound,
} from "next/navigation";

import AestheticPackManager from "../../../../../components/servers/AestheticPackManager";
import ServerStudioNav from "../../../../../components/servers/ServerStudioNav";

import {
    getDefaultAestheticPackId,
    getServerAestheticPacks,
} from "../../../../../lib/aestheticPacks";

import {
    getServerStudioContext,
} from "../../../../../lib/serverStudio";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

export const metadata =
    dashboardMetadata(
        "Server Packs",
        "Curated aesthetic packs members can pull from in this server."
    );

export default async function PacksPage({
    params,
}: PageProps) {
    const {
        id,
    } =
        await params;

    const {
        guild,
        installed,
        iconUrl,
    } =
        await getServerStudioContext(
            id
        );

    if (!installed) {
        notFound();
    }

    const [
        packs,
        defaultPackId,
    ] =
        await Promise.all([
            getServerAestheticPacks(
                guild.id
            ),

            getDefaultAestheticPackId(
                guild.id
            ),
        ]);

    return (
        <>
            <a
                href="/dashboard/servers"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft
                    size={
                        16
                    }
                />
                My Servers
            </a>

            <div className="mt-6 flex min-w-0 items-center gap-5">
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

                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                            <Bot
                                size={
                                    13
                                }
                            />
                            Connected
                        </span>
                    </div>
                </div>
            </div>

            <ServerStudioNav
                guildId={
                    guild.id
                }
                active="packs"
            />

            <div className="mt-8">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                        <Boxes
                            size={
                                18
                            }
                        />
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                            Aesthetic Packs
                        </p>

                        <h2 className="mt-1 text-2xl font-bold tracking-tight">
                            Server Packs
                        </h2>
                    </div>
                </div>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
                    Create coordinated aesthetic presets
                    your community can use across
                    Aesthetic King.
                </p>
            </div>

            <div className="mt-6">
                <AestheticPackManager
                    guildId={
                        guild.id
                    }
                    initialPacks={
                        packs
                    }
                    initialDefaultPackId={
                        defaultPackId
                    }
                />
            </div>
        </>
    );
}
