import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "../../../../../lib/auth";

import {
    getValidDiscordAccessToken,
} from "../../../../../lib/discordOAuth";

import {
    isGuildInstalled,
} from "../../../../../lib/guilds";

import {
    setGuildCommandEnabled,
} from "../../../../../lib/commandSettings";

import {
    isManageableServerCommand,
} from "../../../../../lib/serverCommands";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../lib/session";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

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
        BigInt(guild.permissions);

    return (
        (permissions & ADMINISTRATOR) !== BigInt(0) ||
        (permissions & MANAGE_GUILD) !== BigInt(0)
    );
}

export async function PATCH(
    request: NextRequest,
    { params }: RouteContext
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { id: guildId } =
        await params;

    const accessToken =
        await getValidDiscordAccessToken(
            session.discordId
        );

    if (!accessToken) {
        return NextResponse.json(
            {
                error:
                    "Discord connection required.",
            },
            { status: 401 }
        );
    }

    const guilds =
        await getDiscordGuilds(
            accessToken
        );

    const guild =
        guilds.find(
            (candidate) =>
                candidate.id === guildId
        );

    if (
        !guild ||
        !canManageGuild(guild)
    ) {
        return NextResponse.json(
            {
                error:
                    "You do not have permission to manage this server.",
            },
            { status: 403 }
        );
    }

    if (
        !(await isGuildInstalled(
            guildId
        ))
    ) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic King is not installed in this server.",
            },
            { status: 400 }
        );
    }

    const body =
        await request.json() as {
            commandName?: string;
            enabled?: boolean;
        };

    if (
        !body.commandName ||
        !isManageableServerCommand(
            body.commandName
        ) ||
        typeof body.enabled !==
            "boolean"
    ) {
        return NextResponse.json(
            {
                error:
                    "Invalid command setting.",
            },
            { status: 400 }
        );
    }

    try {
        const setting =
            await setGuildCommandEnabled(
                guildId,
                body.commandName,
                body.enabled
            );

        return NextResponse.json({
            setting,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not update command setting."
        );
    }
}
