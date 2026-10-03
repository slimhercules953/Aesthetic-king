import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    deleteServerAestheticPack,
    updateServerAestheticPack,
} from "../../../../../../lib/aestheticPacks";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "../../../../../../lib/auth";

import {
    getValidDiscordAccessToken,
} from "../../../../../../lib/discordOAuth";

import {
    isValidAestheticId,
} from "../../../../../../lib/aesthetics";

import {
    isGuildInstalled,
} from "../../../../../../lib/guilds";

import {
    isValidMoodId,
} from "../../../../../../lib/moods";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../../lib/session";

type RouteContext = {
    params: Promise<{
        id: string;
        packId: string;
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

async function authorize(
    request: NextRequest,
    guildId: string
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return false;
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return false;
    }

    const accessToken =
        await getValidDiscordAccessToken(
            session.discordId
        );

    if (!accessToken) {
        return false;
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
        return false;
    }

    return isGuildInstalled(
        guildId
    );
}

function sanitizeArray(
    value: unknown,
    max: number
) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(
            (item):
                item is string =>
                typeof item ===
                "string"
        )
        .map(
            (item) =>
                item.trim()
        )
        .filter(Boolean)
        .slice(
            0,
            max
        );
}

export async function PATCH(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const {
        id: guildId,
        packId,
    } =
        await params;

    if (
        !(await authorize(
            request,
            guildId
        ))
    ) {
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

    const body =
        await request.json() as {
            name?: string;
            description?: string;
            aestheticId?:
                string | null;
            moodId?:
                string | null;
            colors?: string[];
            symbols?: string[];
            enabled?: boolean;
        };

    const name =
        body.name?.trim();

    if (!name) {
        return NextResponse.json(
            {
                error:
                    "Pack name is required.",
            },
            {
                status: 400,
            }
        );
    }

    const aestheticId =
        body.aestheticId
            ?.trim()
            .toLowerCase() ||
        null;

    const moodId =
        body.moodId
            ?.trim()
            .toLowerCase() ||
        null;

    if (
        aestheticId &&
        !isValidAestheticId(
            aestheticId
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Invalid aesthetic.",
            },
            {
                status: 400,
            }
        );
    }

    if (
        moodId &&
        !isValidMoodId(
            moodId
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Invalid mood.",
            },
            {
                status: 400,
            }
        );
    }

    try {
        const pack =
            await updateServerAestheticPack(
                guildId,
                packId,
                {
                    name,
                    description:
                        body.description
                            ?.trim() ||
                        null,
                    aestheticId,
                    moodId,
                    colors:
                        sanitizeArray(
                            body.colors,
                            5
                        ),
                    symbols:
                        sanitizeArray(
                            body.symbols,
                            8
                        ),
                    enabled:
                        body.enabled ??
                        true,
                }
            );

        return NextResponse.json({
            pack,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not update Aesthetic Pack.",
            },
            {
                status: 400,
            }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const {
        id: guildId,
        packId,
    } =
        await params;

    if (
        !(await authorize(
            request,
            guildId
        ))
    ) {
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

    try {
        await deleteServerAestheticPack(
            guildId,
            packId
        );

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not delete Aesthetic Pack.",
            },
            {
                status: 400,
            }
        );
    }
}
