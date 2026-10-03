import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    generateAesthetic,
} from "../../../../lib/aestheticGenerator";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

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
            aestheticId?: string;
            moodId?: string;
            colorFilter?: string;
            request?: string;
        };

    if (
        !body.aestheticId?.trim()
    ) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic is required.",
            },
            {
                status: 400,
            }
        );
    }

    try {
        const aesthetic =
            await generateAesthetic({
                aestheticId:
                    body.aestheticId,

                moodId:
                    body.moodId,

                colorFilter:
                    body.colorFilter,

                request:
                    body.request,
            });

        return NextResponse.json({
            aesthetic,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unable to generate aesthetic.",
            },
            {
                status: 500,
            }
        );
    }
}