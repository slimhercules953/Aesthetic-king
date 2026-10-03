import {
    cookies,
} from "next/headers";

import {
    redirect,
} from "next/navigation";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "../../../lib/auth";

import {
    getValidDiscordAccessToken,
} from "../../../lib/discordOAuth";

import {
    getInstalledGuildIds,
} from "../../../lib/guilds";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

const ADMINISTRATOR =
    BigInt(1) << BigInt(3);

const MANAGE_GUILD =
    BigInt(1) << BigInt(5);

function canManageGuild(
    guild: DiscordGuild
) {
    if (guild.owner) {
        return true;
    }

    const permissions =
        BigInt(
            guild.permissions
        );

    return (
        (permissions &
            ADMINISTRATOR) !==
            BigInt(0) ||
        (permissions &
            MANAGE_GUILD) !==
            BigInt(0)
    );
}

function getGuildIconUrl(
    guild: DiscordGuild
) {
    if (!guild.icon) {
        return null;
    }

    return (
        `https://cdn.discordapp.com/icons/` +
        `${guild.id}/${guild.icon}.png?size=128`
    );
}

export default async function ServersPage() {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        redirect("/");
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        redirect("/");
    }

    const accessToken =
        await getValidDiscordAccessToken(
            session.discordId
        );

    if (!accessToken) {
        return (
            <>
                <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
                    Discord
                </p>

                <h2 className="mt-3 text-4xl font-bold">
                    My Servers
                </h2>

                <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
                    <h3 className="text-lg font-semibold">
                        Discord connection required
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                        A valid Discord OAuth connection
                        could not be found for this account.
                    </p>
                </div>
            </>
        );
    }

    const [
        guilds,
        installedGuildIds,
    ] =
        await Promise.all([
            getDiscordGuilds(
                accessToken
            ),

            getInstalledGuildIds(),
        ]);

    const manageableGuilds =
        guilds.filter(
            canManageGuild
        );

    return (
        <>
            <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
                Discord
            </p>

            <h2 className="mt-3 text-4xl font-bold">
                My Servers
            </h2>

            <p className="mt-3 max-w-2xl text-zinc-400">
                Servers where you are the owner,
                Administrator, or have Manage Server
                permission.
            </p>

            {manageableGuilds.length ===
            0 ? (
                <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
                    <h3 className="text-lg font-semibold">
                        No manageable servers found
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                        Discord did not return any
                        servers where this account has
                        management permissions.
                    </p>
                </div>
            ) : (
                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {manageableGuilds.map(
                        (guild) => {
                            const iconUrl =
                                getGuildIconUrl(
                                    guild
                                );

                            const installed =
                                installedGuildIds.has(
                                    guild.id
                                );

                            return (
                                <article
                                    key={
                                        guild.id
                                    }
                                    className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 transition hover:border-zinc-700 hover:bg-zinc-950"
                                >
                                    <div className="flex items-start gap-4">
                                        {iconUrl ? (
                                            <img
                                                src={
                                                    iconUrl
                                                }
                                                alt=""
                                                className="h-14 w-14 rounded-2xl object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 text-lg font-bold text-zinc-300">
                                                {guild.name
                                                    .charAt(
                                                        0
                                                    )
                                                    .toUpperCase()}
                                            </div>
                                        )}

                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-lg font-semibold">
                                                {
                                                    guild.name
                                                }
                                            </h3>

                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <span className="inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
                                                    {guild.owner
                                                        ? "Owner"
                                                        : "Manager"}
                                                </span>

                                                {installed ? (
                                                    <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                                                        Aesthetic King Installed
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-400">
                                                        Not Installed
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        {installed ? (
                                            <a
                                                href={`/dashboard/servers/${guild.id}`}
                                                className="block w-full rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-center text-sm font-medium text-violet-300 transition hover:border-violet-400/50 hover:bg-violet-500/15"
                                            >
                                                Open Server Studio
                                            </a>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled
                                                className="w-full cursor-not-allowed rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-500"
                                            >
                                                Add Aesthetic King
                                                coming next
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        }
                    )}
                </div>
            )}
        </>
    );
}