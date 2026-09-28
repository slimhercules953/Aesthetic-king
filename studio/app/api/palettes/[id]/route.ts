import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    deleteSavedPalette,
    renameSavedPalette,
} from "../../../../lib/palettes";

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

    if (!body.name?.trim()) {
        return NextResponse.json(
            {
                error:
                    "Palette name is required.",
            },
            {
                status: 400,
            }
        );
    }

    const renamed =
        await renameSavedPalette(
            id,
            session.discordId,
            body.name
        );

    if (!renamed) {
        return NextResponse.json(
            {
                error:
                    "Palette not found.",
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
        await deleteSavedPalette(
            id,
            session.discordId
        );

    if (!deleted) {
        return NextResponse.json(
            {
                error:
                    "Palette not found.",
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