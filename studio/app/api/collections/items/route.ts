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

import {
    requireFeature,
} from "../../../../lib/gate";

import {
    isPremiumSet,
} from "../../../../lib/assetCatalog";

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

    // Saving premium artwork into a collection is a use of it, so it
    // needs the same entitlement as saving an aesthetic. Removing an
    // item stays allowed - a locked set may already be in a collection
    // from before, and hiding the remove button would trap it there.
    if (isPremiumSet(body.setId)) {
        const assets =
            await requireFeature(
                session.discordId,
                "PREMIUM_ASSETS"
            );

        if (!assets.allowed) {
            return assets.response;
        }
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