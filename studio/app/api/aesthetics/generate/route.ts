import {
    handleRouteError,
} from "../../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    generateAesthetic,
} from "../../../../lib/aestheticGenerator";

import {
    requireFeature,
} from "../../../../lib/gate";

import {
    recordUsage,
    refundUsage,
} from "../../../../lib/usage";

import {
    FEATURES,
} from "../../../../lib/features";

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

    // Reserve the generation before spending time on it, then refund
    // if the model fails. Checking after the work would let a user at
    // their limit keep generating for free on every failed call.
    const gate =
        await requireFeature(
            session.discordId,
            "AI_GENERATION_LIMIT"
        );

    if (!gate.allowed) {
        return gate.response;
    }

    const usageOptions = {
        usageSource:
            FEATURES.AI_GENERATION_LIMIT.usageSource,
        resetPeriod:
            gate.access.resetPeriod,
    } as const;

    await recordUsage(
        session.discordId,
        "AI_GENERATION_LIMIT",
        usageOptions
    );

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
        await refundUsage(
            session.discordId,
            "AI_GENERATION_LIMIT",
            usageOptions
        );

        return handleRouteError(
            error,
            500,
            "Unable to generate aesthetic."
        );
    }
}