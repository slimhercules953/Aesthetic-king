import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    grantEntitlement,
    revokeEntitlement,
} from "../../../../lib/entitlements";

import {
    billingDevToolsEnabled,
} from "../../../../lib/devTools";

/**
 * Grants or revokes Premium so the entitlement system can be tested
 * without a payment provider.
 *
 * This is the shape a real provider webhook will eventually take —
 * it calls the same two functions. Keeping it behind BILLING_DEV
 * means production cannot hand out Premium by posting to a URL.
 */

const ALLOWED_MONTHS = new Set([
    1,
    3,
    12,
]);

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

    if (
        !billingDevToolsEnabled(
            session.discordId
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Billing development tools are disabled.",
            },
            {
                status: 404,
            }
        );
    }

    const formData =
        await request.formData();

    const action =
        formData.get("action");

    if (action === "revoke") {
        await revokeEntitlement(
            session.discordId,
            "PREMIUM"
        );

        return NextResponse.redirect(
            new URL(
                "/dashboard/premium/billing",
                request.url
            )
        );
    }

    const months = Number(
        formData.get("months")
    );

    if (!ALLOWED_MONTHS.has(months)) {
        return NextResponse.json(
            {
                error:
                    "Unsupported duration.",
            },
            {
                status: 400,
            }
        );
    }

    const startsAt =
        new Date();

    const endsAt =
        new Date(
            startsAt.getTime()
        );

    endsAt.setMonth(
        endsAt.getMonth() +
            months
    );

    await grantEntitlement(
        session.discordId,
        {
            type: "PREMIUM",

            source:
                "dev-grant",

            startsAt,
            endsAt,

            /*
             * The dev grant stands in for a purchase, so it must behave
             * like one: staff accounts are usually grandfathered, and a
             * test grant that switched off their permanent access would
             * not come back until they signed in again.
             */
            preservePermanent: true,
        }
    );

    return NextResponse.redirect(
        new URL(
            "/dashboard/premium/billing",
            request.url
        )
    );
}
