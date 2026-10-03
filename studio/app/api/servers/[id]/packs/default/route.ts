import {
    handleRouteError,
} from "../../../../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    setDefaultAestheticPack,
} from "../../../../../../lib/aestheticPacks";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "../../../../../../lib/auth";

import {
    getValidDiscordAccessToken,
} from "../../../../../../lib/discordOAuth";

import {
    isGuildInstalled,
} from "../../../../../../lib/guilds";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../../lib/session";

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

export async function PATCH(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return NextResponse.json(
            {
                error:
                    "Unauthorized",
            },
            {
                status: 401,
            }
        );
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return NextResponse.json(
            {
                error:
                    "Unauthorized",
            },
            {
                status: 401,
            }
        );
    }

    const {
        id: guildId,
    } =
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
            {
                status: 401,
            }
        );
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
        ) ||
        !(await isGuildInstalled(
            guildId
        ))
    ) {
        return NextResponse.json(
            {
                error:
                    "Unauthorized",
            },
            {
                status: 403,
            }
        );
    }

    const body =
        await request.json() as {
            packId?: string | null;
        };

    try {
        await setDefaultAestheticPack(
            guildId,
            body.packId ??
                null
        );

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not update default Aesthetic Pack."
        );
    }
}
