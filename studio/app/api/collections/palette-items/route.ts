import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    addPaletteToCollection,
    removePaletteFromCollection,
} from "../../../../lib/collections";

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
            collectionId?: string;
            paletteId?: string;
        };

    if (
        !body.collectionId ||
        !body.paletteId
    ) {
        return NextResponse.json(
            {
                error:
                    "collectionId and paletteId are required.",
            },
            {
                status: 400,
            }
        );
    }

    await addPaletteToCollection(
        body.collectionId,
        session.discordId,
        body.paletteId
    );

    return NextResponse.json({
        success: true,
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
            collectionId?: string;
            paletteId?: string;
        };

    if (
        !body.collectionId ||
        !body.paletteId
    ) {
        return NextResponse.json(
            {
                error:
                    "collectionId and paletteId are required.",
            },
            {
                status: 400,
            }
        );
    }

    await removePaletteFromCollection(
        body.collectionId,
        session.discordId,
        body.paletteId
    );

    return NextResponse.json({
        success: true,
    });
}