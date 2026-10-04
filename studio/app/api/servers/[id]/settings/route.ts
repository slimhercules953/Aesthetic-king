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
    updateGuildSettings,
    type GuildSettingsPatch,
} from "../../../../../lib/guildSettings";

import {
    isValidAestheticId,
} from "../../../../../lib/aesthetics";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../lib/session";

import {
    isValidMoodId,
} from "../../../../../lib/moods";

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

async function getSession(
    request: NextRequest
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return null;
    }

    return verifySessionToken(
        cookie.value
    );
}

export async function PATCH(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const session =
        await getSession(
            request
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
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "You do not have permission to manage this server.",
            },
            {
                status: 403,
            }
        );
    }

    const installed =
        await isGuildInstalled(
            guildId
        );

    if (!installed) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic King is not installed in this server.",
            },
            {
                status: 400,
            }
        );
    }

    const body =
        await request.json() as {
            generationChannelId?:
            string | null;

            defaultAestheticId?:
            string | null;

            defaultMoodId?:
            string | null;
        };

    /*
     * Every field is validated before anything is written, so a request
     * carrying one bad value cannot leave the others half-applied.
     */
    const patch: GuildSettingsPatch = {};

    if (
        Object.prototype.hasOwnProperty.call(
            body,
            "generationChannelId"
        )
    ) {
        const generationChannelId =
            typeof body.generationChannelId ===
                "string"
                ? body.generationChannelId.trim()
                : null;

        patch.generationChannelId =
            generationChannelId || null;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            body,
            "defaultAestheticId"
        )
    ) {
        const defaultAestheticId =
            typeof body.defaultAestheticId ===
                "string"
                ? body.defaultAestheticId
                    .trim()
                    .toLowerCase()
                : null;

        if (
            defaultAestheticId &&
            !isValidAestheticId(
                defaultAestheticId
            )
        ) {
            return NextResponse.json(
                {
                    error:
                        "Invalid default aesthetic.",
                },
                {
                    status: 400,
                }
            );
        }

        patch.defaultAestheticId =
            defaultAestheticId || null;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            body,
            "defaultMoodId"
        )
    ) {
        const defaultMoodId =
            typeof body.defaultMoodId ===
                "string"
                ? body.defaultMoodId
                    .trim()
                    .toLowerCase()
                : null;

        if (
            defaultMoodId &&
            !isValidMoodId(
                defaultMoodId
            )
        ) {
            return NextResponse.json(
                {
                    error:
                        "Invalid default mood.",
                },
                {
                    status: 400,
                }
            );
        }

        patch.defaultMoodId =
            defaultMoodId || null;
    }

    if (
        Object.keys(patch).length === 0
    ) {
        return NextResponse.json(
            {
                error:
                    "No supported server setting was provided.",
            },
            {
                status: 400,
            }
        );
    }

    try {
        /*
         * One statement for the whole patch. This used to call a
         * separate updater per field and keep the last result, which
         * meant the settings form — always sending all three fields —
         * silently discarded the mood whenever an aesthetic was
         * present in the same save.
         */
        const settings =
            await updateGuildSettings(
                guildId,
                patch
            );

        return NextResponse.json({
            settings,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not update server settings."
        );
    }
}