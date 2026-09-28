import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    deleteSavedAestheticForDiscordUser,
    renameSavedAestheticForDiscordUser,
} from "../../../../lib/savedAesthetics";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

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
    context: RouteContext
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
        id,
    } =
        await context.params;

    const body =
        await request.json() as {
            name?: string;
        };

    const name =
        body.name?.trim();

    if (!name) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic name is required.",
            },
            {
                status: 400,
            }
        );
    }

    if (name.length > 100) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic name must be 100 characters or fewer.",
            },
            {
                status: 400,
            }
        );
    }

    const aesthetic =
        await renameSavedAestheticForDiscordUser(
            id,
            session.discordId,
            name
        );

    if (!aesthetic) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic not found.",
            },
            {
                status: 404,
            }
        );
    }

    return NextResponse.json({
        aesthetic,
    });
}

export async function DELETE(
    request: NextRequest,
    context: RouteContext
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
        id,
    } =
        await context.params;

    const deleted =
        await deleteSavedAestheticForDiscordUser(
            id,
            session.discordId
        );

    if (!deleted) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic not found.",
            },
            {
                status: 404,
            }
        );
    }

    return NextResponse.json({
        success: true,
    });
}