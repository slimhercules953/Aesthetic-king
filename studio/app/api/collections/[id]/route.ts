import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    deleteCollection,
    renameCollection,
} from "../../../../lib/collections";

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
                    "Collection name is required.",
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
                    "Collection name must be 100 characters or fewer.",
            },
            {
                status: 400,
            }
        );
    }

    const renamed =
        await renameCollection(
            id,
            session.discordId,
            name
        );

    if (!renamed) {
        return NextResponse.json(
            {
                error:
                    "Collection not found.",
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
        await deleteCollection(
            id,
            session.discordId
        );

    if (!deleted) {
        return NextResponse.json(
            {
                error:
                    "Collection not found.",
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