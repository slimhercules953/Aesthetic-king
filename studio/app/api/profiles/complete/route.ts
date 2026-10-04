import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    ExpectedError,
    handleRouteError,
} from "../../../../lib/apiError";

import {
    requireFeature,
} from "../../../../lib/gate";

import {
    getFeatureAccessMany,
} from "../../../../lib/featureAccess";

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

import {
    getCompletableSets,
} from "../../../../lib/profileSets";

import {
    completeProfile,
    parseCompletionSeed,
    parseExistingDraft,
} from "../../../../lib/profileCompletion";

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

function expectedErrorResponse(
    error: ExpectedError
): NextResponse {
    return NextResponse.json(
        {
            error: error.message,
        },
        {
            status: error.status ?? 400,
        }
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
        (
            await request
                .json()
                .catch(() => null)
        ) as Record<
            string,
            unknown
        > | null;

    /*
     * Parse before spending a generation. A malformed body is the user's
     * mistake and costs nothing, whereas reserving first and then failing
     * would need a refund — and a refund that itself fails silently
     * charges someone for a request that never ran.
     */
    let seed;
    let existing;

    try {
        seed = parseCompletionSeed(
            body?.seed
        );

        existing = parseExistingDraft(
            body?.draft
        );
    } catch (error) {
        if (error instanceof ExpectedError) {
            return expectedErrorResponse(
                error
            );
        }

        return handleRouteError(
            error,
            500,
            "Could not read that request."
        );
    }

    const gate =
        await requireFeature(
            session.discordId,
            "COMPLETE_PROFILE_LIMIT"
        );

    if (!gate.allowed) {
        return gate.response;
    }

    const usageOptions = {
        usageSource:
            FEATURES.COMPLETE_PROFILE_LIMIT
                .usageSource,
        resetPeriod:
            gate.access.resetPeriod,
    } as const;

    await recordUsage(
        session.discordId,
        "COMPLETE_PROFILE_LIMIT",
        usageOptions
    );

    try {
        const access =
            await getFeatureAccessMany(
                session.discordId,
                [
                    "PREMIUM_ASSETS",
                    "COMPLETE_PROFILE_LIMIT",
                ]
            );

        /*
         * Re-read rather than subtracting one from the gate's figure: the
         * gate answered before `recordUsage` moved the counter, and a
         * Crown boost that expired mid-request would make arithmetic on
         * the stale number wrong.
         */
        const remaining =
            access.COMPLETE_PROFILE_LIMIT
                .remaining;

        const excludeSetId =
            typeof body?.excludeSetId ===
                "string" &&
                body.excludeSetId.trim()
                ? body.excludeSetId.trim()
                : null;

        const completed =
            await completeProfile({
                seed,
                sets: getCompletableSets(
                    access.PREMIUM_ASSETS
                        .allowed
                ),
                existing,
                excludeSetId,
                useAi: Boolean(
                    body?.useAi
                ),
            });

        return NextResponse.json({
            draft: completed.draft,
            filled: completed.filled,
            ai: completed.ai,
            aestheticId:
                completed.aestheticId,
            moodId: completed.moodId,
            setId:
                completed.set?.id ?? null,
            remaining,
        });
    } catch (error) {
        /*
         * Refund before answering. The composition can legitimately fail —
         * the catalog may have no set for a colour, or a set may have been
         * retired since the page loaded — and charging for a profile the
         * user never received is the one outcome worse than an error.
         */
        await refundUsage(
            session.discordId,
            "COMPLETE_PROFILE_LIMIT",
            usageOptions
        );

        if (error instanceof ExpectedError) {
            return expectedErrorResponse(
                error
            );
        }

        return handleRouteError(
            error,
            500,
            "Unable to complete that profile."
        );
    }
}
