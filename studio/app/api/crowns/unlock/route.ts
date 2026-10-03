import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    isFeatureId,
    getCrownUnlockTerms,
} from "../../../../lib/features";

import {
    purchaseUnlock,
} from "../../../../lib/unlocks";

/**
 * Buys a Crown unlock.
 *
 * JSON rather than a form post because the button that triggers it
 * usually sits inside a refusal shown in the middle of another
 * action — the user should be able to pay and continue without
 * leaving the page. The response carries the new balance so the
 * caller can update the number it is showing.
 */
export async function POST(
    request: NextRequest
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
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

    const session =
        await verifySessionToken(
            cookie.value
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

    const payload =
        await request
            .json()
            .catch(
                () =>
                    null
            ) as {
            feature?: unknown;
        } | null;

    const feature =
        payload?.feature;

    if (
        !isFeatureId(
            feature
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Unknown feature.",
            },
            {
                status: 400,
            }
        );
    }

    const terms =
        getCrownUnlockTerms(
            feature
        );

    if (!terms) {
        return NextResponse.json(
            {
                error:
                    "That feature cannot be unlocked with Crowns.",
            },
            {
                status: 400,
            }
        );
    }

    const result =
        await purchaseUnlock(
            session.discordId,
            feature
        );

    if (!result.ok) {
        return NextResponse.json(
            {
                error:
                    result.reason ===
                        "insufficient"
                        ? `You need ${terms.cost} Crowns and have ${result.balance}.`
                        : "That unlock is already active.",

                reason:
                    result.reason,

                balance:
                    result.balance,
            },
            {
                status:
                    result.reason ===
                        "insufficient"
                        ? 402
                        : 409,
            }
        );
    }

    return NextResponse.json({
        ok: true,

        feature:
            result.unlock.feature,

        kind:
            result.unlock.kind,

        allowance:
            result.unlock.allowance,

        expiresAt:
            result.unlock.expiresAt,

        cost:
            terms.cost,

        balance:
            result.balance,
    });
}
