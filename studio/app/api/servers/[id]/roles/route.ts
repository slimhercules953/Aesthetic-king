import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    guardGuildAccessWithSession,
} from "../../../../../lib/guildAccess";

import {
    isGuildInstalled,
} from "../../../../../lib/guilds";

import {
    getBotInviteUrl,
} from "../../../../../lib/botInvite";

import {
    createCosmeticRole,
    forgetCosmeticRole,
    getRoleToolStatus,
    listCosmeticRoles,
    recordCosmeticRole,
} from "../../../../../lib/guildRoles";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

/**
 * Cosmetic roles for a server.
 *
 * `id` is the Discord guild id, matching every other `/api/servers/[id]`
 * route. The roles themselves live on Discord; the rows behind this are the
 * receipts for the ones this tool made.
 */

async function loadState(
    guildId: string
) {
    const status = await getRoleToolStatus(
        guildId
    ).catch(() => ({
        canRead: false,
        canManageRoles: null,
    }));

    /*
     * The receipt list is optional. If the database is briefly unhappy the
     * maker still works, it just shows no history.
     */
    const roles = await listCosmeticRoles(
        guildId
    ).catch(() => []);

    return {
        status,
        roles,
        inviteUrl: getBotInviteUrl(guildId),
    };
}

export async function GET(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await guardGuildAccessWithSession(
            request,
            id
        );

        if (denied.response) {
            return denied.response;
        }

        return NextResponse.json(
            await loadState(id)
        );
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load the roles for this server."
        );
    }
}

/**
 * Creates one cosmetic role.
 *
 * Only `name` and `color` are read from the body; hoisting, mentioning and
 * permissions are fixed by the lib, so this route cannot be used to mint a
 * role with powers.
 */
export async function POST(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await guardGuildAccessWithSession(
            request,
            id
        );

        if (denied.response) {
            return denied.response;
        }

        /*
         * The role is created by the bot, so a server that has since removed
         * it would otherwise produce a confusing 404 from Discord.
         */
        if (!(await isGuildInstalled(id))) {
            return NextResponse.json(
                {
                    error:
                        "Aesthetic King is not installed in this server.",
                },
                { status: 400 }
            );
        }

        const body = (await request
            .json()
            .catch(() => null)) as Record<
            string,
            unknown
        > | null;

        const result = await createCosmeticRole(id, {
            name: body?.name,
            color: body?.color,
        });

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error },
                { status: 400 }
            );
        }

        /*
         * The role exists on Discord now. Failing to write the receipt must
         * not be reported as a failure to create it, or the owner presses the
         * button again and makes a second role.
         */
        const receipt = await recordCosmeticRole(
            id,
            result.role,
            denied.session.discordId
        ).catch(() => null);

        if (!receipt) {
            console.error(
                `Cosmetic role ${result.role.id} created in ${id} but not recorded.`
            );
        }

        return NextResponse.json({
            role: result.role,
            state: await loadState(id),
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not create that role."
        );
    }
}

/**
 * Removes a receipt, not the Discord role.
 *
 * Deleting a role is a destructive Discord action that belongs in Discord,
 * where the owner can see what they are removing. This only clears our record
 * of a role that is already gone.
 */
export async function DELETE(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await guardGuildAccessWithSession(
            request,
            id
        );

        if (denied.response) {
            return denied.response;
        }

        const recordId =
            new URL(request.url).searchParams.get(
                "record"
            ) ?? "";

        const removed = await forgetCosmeticRole(
            id,
            recordId
        );

        if (!removed) {
            return NextResponse.json(
                {
                    error:
                        "That role entry is not in this server.",
                },
                { status: 404 }
            );
        }

        return NextResponse.json(
            await loadState(id)
        );
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not remove that role entry."
        );
    }
}
