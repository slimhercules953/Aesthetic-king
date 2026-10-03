import {
    handleRouteError,
} from "../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    createSavedAesthetic,
} from "../../../lib/savedAesthetics";

import {
    requireFeature,
} from "../../../lib/gate";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

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
            generationId?: string;

            name?: string;

            aestheticId?: string;
            moodId?: string | null;
            colorFilter?: string | null;

            profileSetId?: string;

            usernameIdea?: string;
            bio?: string;
            status?: string;

            symbols?: string[];
            palette?: string[];
        };

    if (
        !body.name?.trim() ||
        !body.aestheticId?.trim() ||
        !body.profileSetId ||
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
                    "Generated aesthetic data is incomplete.",
            },
            {
                status: 400,
            }
        );
    }

    const gate =
        await requireFeature(
            session.discordId,
            "SAVED_PROFILE_LIMIT"
        );

    if (!gate.allowed) {
        return gate.response;
    }

    try {
        const aesthetic =
            await createSavedAesthetic(
                session.discordId,
                {
                    generationId:
                        body.generationId ??
                        null,

                    name:
                        body.name,

                    aestheticId:
                        body.aestheticId,

                    moodId:
                        body.moodId ??
                        null,

                    colorFilter:
                        body.colorFilter ??
                        null,

                    profileSetId:
                        body.profileSetId,

                    usernameIdea:
                        body.usernameIdea ??
                        null,

                    bio:
                        body.bio ??
                        null,

                    status:
                        body.status ??
                        null,

                    symbols:
                        body.symbols,

                    palette:
                        body.palette,
                }
            );

        return NextResponse.json({
            aesthetic,
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Unable to save aesthetic."
        );
    }
}