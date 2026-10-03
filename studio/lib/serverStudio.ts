import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "./auth";

import {
    getValidDiscordAccessToken,
} from "./discordOAuth";

import {
    isGuildInstalled,
} from "./guilds";

import {
    getGuildSettingsByDiscordId,
    type GuildSettings,
} from "./guildSettings";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "./session";

const ADMINISTRATOR =
    BigInt(1) << BigInt(3);

const MANAGE_GUILD =
    BigInt(1) << BigInt(5);

export type ServerStudioContext = {
    guild: DiscordGuild;
    installed: boolean;
    settings: GuildSettings | null;
    iconUrl: string | null;
};

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
        `${guild.id}/${guild.icon}.png?size=256`
    );
}

export async function getServerStudioContext(
    guildId: string
): Promise<ServerStudioContext> {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        notFound();
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        notFound();
    }

    const accessToken =
        await getValidDiscordAccessToken(
            session.discordId
        );

    if (!accessToken) {
        notFound();
    }

    const guilds =
        await getDiscordGuilds(
            accessToken
        );

    const guild =
        guilds.find(
            (candidate) =>
                candidate.id ===
                guildId
        );

    if (
        !guild ||
        !canManageGuild(
            guild
        )
    ) {
        notFound();
    }

    const installed =
        await isGuildInstalled(
            guild.id
        );

    const settings =
        installed
            ? await getGuildSettingsByDiscordId(
                  guild.id
              )
            : null;

    return {
        guild,
        installed,
        settings,
        iconUrl:
            getGuildIconUrl(
                guild
            ),
    };
}
