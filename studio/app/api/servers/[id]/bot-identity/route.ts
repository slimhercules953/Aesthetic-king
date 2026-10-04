import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    guardGuildAccess,
} from "../../../../../lib/guildAccess";

import {
    getBotGuildIdentity,
    updateBotGuildIdentity,
} from "../../../../../lib/discordBot";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

/**
 * The bot's nickname and avatar *in this server*.
 *
 * These values live on Discord, not in our database — there is nothing to
 * read back after a save, so the response is always a fresh read of the
 * member record. That also means a change made directly in Discord shows up
 * on the next load rather than drifting against a stale local copy.
 */
export async function GET(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await guardGuildAccess(
            request,
            id
        );

        if (denied) {
            return denied;
        }

        return NextResponse.json({
            identity:
                await getBotGuildIdentity(id),
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load the bot's profile for this server."
        );
    }
}

/**
 * Partial update: an absent key is left untouched, and an explicit `null`
 * clears the value and restores the bot's global one.
 */
export async function PATCH(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await guardGuildAccess(
            request,
            id
        );

        if (denied) {
            return denied;
        }

        const body = await request.json() as Record<
            string,
            unknown
        >;

        /*
         * Only these two keys are forwarded. Anything else in the body is
         * ignored rather than passed to Discord, so this route cannot be
         * used to write arbitrary fields onto the bot's member record.
         */
        const result = await updateBotGuildIdentity(id, {
            ...(body?.nick !== undefined
                ? {
                    nick:
                        body.nick === null
                            ? null
                            : String(body.nick),
                }
                : {}),

            ...(body?.avatar !== undefined
                ? {
                    avatar:
                        body.avatar === null
                            ? null
                            : String(body.avatar),
                }
                : {}),
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error },
                { status: 400 }
            );
        }

        return NextResponse.json({
            identity: result.identity,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not update the bot's profile for this server."
        );
    }
}
