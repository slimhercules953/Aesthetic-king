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
    isGuildInstalled,
} from "../../../../../lib/guilds";

import {
    getGuildAppearance,
    updateGuildAppearance,
} from "../../../../../lib/guildAppearance";

import {
    markSetupStepDone,
} from "../../../../../lib/guildSettings";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

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
            appearance:
                await getGuildAppearance(id),
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load the server appearance."
        );
    }
}

/**
 * Partial update, matching the contract the settings route already uses: a
 * key that is absent from the body is left untouched. The Appearance form
 * saves each control as it is changed, so a full-object contract would make
 * concurrent edits in two tabs overwrite each other.
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

        if (
            !(await isGuildInstalled(id))
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
            await request.json() as Record<
                string,
                unknown
            >;

        const appearance =
            await updateGuildAppearance(
                id,
                body ?? {}
            );

        await markSetupStepDone(id, "appearance");

        return NextResponse.json({
            appearance,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not save the server appearance."
        );
    }
}
