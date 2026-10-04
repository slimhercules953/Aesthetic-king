import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    guardGuildAccess,
} from "../../../../../lib/guildAccess";

import {
    getGuildAnalytics,
    normalizeRange,
} from "../../../../../lib/guildAnalytics";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

/**
 * Read-only analytics feed for the range switcher.
 *
 * The page itself renders the default window server-side; this route exists
 * so changing 7/30/90 days does not reload the whole Studio shell.
 */
export async function GET(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await guardGuildAccess(
            request,
            id
        );

        if (denied) {
            return denied;
        }

        const days = normalizeRange(
            new URL(request.url)
                .searchParams
                .get("days")
        );

        const analytics =
            await getGuildAnalytics(id, days);

        return NextResponse.json({
            analytics,
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load server analytics."
        );
    }
}
