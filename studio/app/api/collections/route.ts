import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    createCollection,
} from "../../../lib/collections";

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
            name?: string;
            description?: string;
        };

    if (!body.name?.trim()) {
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

    const collection =
        await createCollection(
            session.discordId,
            body.name,
            body.description ??
                null
        );

    return NextResponse.json({
        collection,
    });
}