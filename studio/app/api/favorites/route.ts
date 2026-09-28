import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    addFavoriteAssetSet,
    removeFavoriteAssetSet,
} from "../../../lib/favorites";

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

export async function POST(
    request: NextRequest
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

    const body =
        await request.json() as {
            setId?: string;
            assetKey?: string;
        };

    if (
        !body.setId ||
        !body.assetKey
    ) {
        return NextResponse.json(
            {
                error:
                    "setId and assetKey are required.",
            },
            {
                status: 400,
            }
        );
    }

    const favorite =
        await addFavoriteAssetSet(
            session.discordId,
            body.setId,
            body.assetKey
        );

    return NextResponse.json({
        success: true,
        favorite,
    });
}

export async function DELETE(
    request: NextRequest
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

    const body =
        await request.json() as {
            setId?: string;
        };

    if (!body.setId) {
        return NextResponse.json(
            {
                error:
                    "setId is required.",
            },
            {
                status: 400,
            }
        );
    }

    const removed =
        await removeFavoriteAssetSet(
            session.discordId,
            body.setId
        );

    return NextResponse.json({
        success:
            removed,
    });
}