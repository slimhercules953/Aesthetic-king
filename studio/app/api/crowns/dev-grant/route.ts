import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

import {
    creditCrowns,
} from "../../../../lib/crowns";

import {
    crownDevToolsEnabled,
} from "../../../../lib/devTools";

/**
 * Seeds a Crown balance for development.
 *
 * Reward rules are deliberately not finalized, so this route exists
 * only to exercise the ledger and the history UI. It refuses to run
 * unless the deployment sets CROWN_DEV="true", which keeps it inert
 * in production without depending on NODE_ENV (unreliable under
 * Workers).
 */

const MAX_GRANT = 1000;

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
        !crownDevToolsEnabled(
            session.discordId
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Crown development tools are disabled.",
            },
            {
                status: 404,
            }
        );
    }

    const formData =
        await request.formData();

    const amount = Number(
        formData.get("amount")
    );

    if (
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > MAX_GRANT
    ) {
        return NextResponse.json(
            {
                error:
                    `Amount must be a whole number between 1 and ${MAX_GRANT}.`,
            },
            {
                status: 400,
            }
        );
    }

    await creditCrowns(
        session.discordId,
        {
            amount,

            type: "ADJUSTMENT",

            reason:
                "Development grant",

            source:
                "dev-tool",
        }
    );

    return NextResponse.redirect(
        new URL(
            "/dashboard/premium/crowns",
            request.url
        )
    );
}
