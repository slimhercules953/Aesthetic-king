import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    addAssetToCollection,
    removeAssetFromCollection,
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
            setId?: string;
        };

    if (
        !body.collectionId ||
        !body.setId
    ) {
        return NextResponse.json(
            {
                error:
                    "collectionId and setId are required.",
            },
            {
                status: 400,
            }
        );
    }

    await addAssetToCollection(
        body.collectionId,
        session.discordId,
        body.setId
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
            setId?: string;
        };

    if (
        !body.collectionId ||
        !body.setId
    ) {
        return NextResponse.json(
            {
                error:
                    "collectionId and setId are required.",
            },
            {
                status: 400,
            }
        );
    }

    await removeAssetFromCollection(
        body.collectionId,
        session.discordId,
        body.setId
    );

    return NextResponse.json({
        success: true,
    });
}