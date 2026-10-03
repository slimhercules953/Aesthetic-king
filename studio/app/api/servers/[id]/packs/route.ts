import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    createServerAestheticPack,
    getServerAestheticPacks,
} from "../../../../../lib/aestheticPacks";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "../../../../../lib/auth";

import {
    getValidDiscordAccessToken,
} from "../../../../../lib/discordOAuth";

import {
    isValidAestheticId,
} from "../../../../../lib/aesthetics";

import {
    isGuildInstalled,
} from "../../../../../lib/guilds";

import {
    isValidMoodId,
} from "../../../../../lib/moods";

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
        return null;
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return null;
    }

    const accessToken =
        await getValidDiscordAccessToken(
            session.discordId
        );

    if (!accessToken) {
        return null;
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
        return null;
    }

    const installed =
        await isGuildInstalled(
            guildId
        );

    if (!installed) {
        return null;
    }

    return {
        session,
        guild,
    };
}

function sanitizeColors(
    colors: unknown
) {
    if (!Array.isArray(colors)) {
        return [];
    }

    return colors
        .filter(
            (value):
                value is string =>
                typeof value ===
                "string"
        )
        .map(
            (value) =>
                value.trim()
        )
        .filter(Boolean)
        .slice(
            0,
            5
        );
}

function sanitizeSymbols(
    symbols: unknown
) {
    if (!Array.isArray(symbols)) {
        return [];
    }

    return symbols
        .filter(
            (value):
                value is string =>
                typeof value ===
                "string"
        )
        .map(
            (value) =>
                value.trim()
        )
        .filter(Boolean)
        .slice(
            0,
            8
        );
}

export async function GET(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const {
        id: guildId,
    } =
        await params;

    const authorized =
        await authorize(
            request,
            guildId
        );

    if (!authorized) {
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

    const packs =
        await getServerAestheticPacks(
            guildId
        );

    return NextResponse.json({
        packs,
    });
}

export async function POST(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const {
        id: guildId,
    } =
        await params;

    const authorized =
        await authorize(
            request,
            guildId
        );

    if (!authorized) {
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
            await createServerAestheticPack(
                guildId,
                {
                    name,
                    description:
                        body.description
                            ?.trim() ||
                        null,
                    aestheticId,
                    moodId,
                    colors:
                        sanitizeColors(
                            body.colors
                        ),
                    symbols:
                        sanitizeSymbols(
                            body.symbols
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
        return handleRouteError(
            error,
            400,
            "Could not create Aesthetic Pack."
        );
    }
}
