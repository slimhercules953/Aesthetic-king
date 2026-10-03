import {
    ArrowLeft,
    Bot,
    Crown,
    Palette,
    ShieldCheck,
} from "lucide-react";

import ServerAppearanceManager from "../../../../../components/servers/ServerAppearanceManager";
import ServerStudioNav from "../../../../../components/servers/ServerStudioNav";

import {
    getServerStudioContext,
} from "../../../../../lib/serverStudio";

import {
    notFound,
} from "next/navigation";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

export default async function AppearancePage({
    params,
}: PageProps) {
    const { id } = await params;

    const {
        guild,
        installed,
        iconUrl,
    } = await getServerStudioContext(id);

    if (!installed) {
        notFound();
    }

    return (
        <>
            <a
                href="/dashboard/servers"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft size={16} />
                My Servers
            </a>

            <div className="mt-6 flex min-w-0 items-center gap-5">
                {iconUrl ? (
                    <img
                        src={iconUrl}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-3xl object-cover"
                    />
                ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/[0.06] bg-[#101015] text-2xl font-bold text-zinc-300">
                        {guild.name
                            .charAt(0)
                            .toUpperCase()}
                    </div>
                )}

                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Server Studio
                    </p>

                    <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">
                        {guild.name}
                    </h1>

                    <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
                            {guild.owner ? (
                                <Crown size={13} />
                            ) : (
                                <ShieldCheck size={13} />
                            )}

                            {guild.owner
                                ? "Owner"
                                : "Manager"}
                        </span>

                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                            <Bot size={13} />
                            Connected
                        </span>
                    </div>
                </div>
            </div>

            <ServerStudioNav
                guildId={guild.id}
                active="appearance"
            />

            <div className="mt-8">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                        <Palette size={18} />
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                            Appearance
                        </p>

                        <h2 className="mt-1 text-2xl font-bold tracking-tight">
                            How Replies Look
                        </h2>
                    </div>
                </div>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
                    Everything Aesthetic King posts in this
                    server — embed colour, footer, and which
                    controls appear under a result. Changes
                    apply to the next command, not to
                    messages already sent.
                </p>
            </div>

            <div className="mt-6">
                <ServerAppearanceManager
                    guildId={guild.id}
                />
            </div>
        </>
    );
}
