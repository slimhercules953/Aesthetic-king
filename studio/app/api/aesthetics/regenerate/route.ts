import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    regenerateAestheticPart,
    type RegenerationTarget,
} from "../../../../lib/aestheticRegenerator";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

const validTargets:
    RegenerationTarget[] = [
        "username",
        "bio",
        "status",
        "palette",
        "symbols",
        "profileSet",
    ];

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
            target?: RegenerationTarget;

            aestheticId?: string;
            moodId?: string | null;
            colorFilter?: string | null;
            request?: string | null;

            profileSetId?: string;

            usernameIdea?: string;
            bio?: string;
            status?: string;

            symbols?: string[];
            palette?: string[];
        };

    if (
        !body.target ||
        !validTargets.includes(
            body.target
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Invalid regeneration target.",
            },
            {
                status: 400,
            }
        );
    }

    if (
        !body.aestheticId ||
        !body.profileSetId ||
        typeof body.usernameIdea !==
            "string" ||
        typeof body.bio !==
            "string" ||
        typeof body.status !==
            "string" ||
        !Array.isArray(
            body.symbols
        ) ||
        !Array.isArray(
            body.palette
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Current aesthetic data is incomplete.",
            },
            {
                status: 400,
            }
        );
    }

    try {
        const update =
            await regenerateAestheticPart({
                target:
                    body.target,

                aestheticId:
                    body.aestheticId,

                moodId:
                    body.moodId,

                colorFilter:
                    body.colorFilter,

                request:
                    body.request,

                profileSetId:
                    body.profileSetId,

                usernameIdea:
                    body.usernameIdea,

                bio:
                    body.bio,

                status:
                    body.status,

                symbols:
                    body.symbols,

                palette:
                    body.palette,
            });

        return NextResponse.json({
            update,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unable to regenerate aesthetic.",
            },
            {
                status: 500,
            }
        );
    }
}