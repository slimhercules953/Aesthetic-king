import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    createSavedPalette,
} from "../../../lib/palettes";

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
            aestheticId?: string;
            moodId?: string;
            colors?: string[];
        };

    if (
        !Array.isArray(
            body.colors
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "colors are required.",
            },
            {
                status: 400,
            }
        );
    }

    try {
        const palette =
            await createSavedPalette(
                session.discordId,
                {
                    name:
                        body.name,
                    aestheticId:
                        body.aestheticId,
                    moodId:
                        body.moodId,
                    colors:
                        body.colors,
                }
            );

        return NextResponse.json({
            palette,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Could not create palette.",
            },
            {
                status: 400,
            }
        );
    }
}