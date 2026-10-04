import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../lib/session";

import {
    recordPostView,
} from "../../../../../lib/creatorAnalytics";

/**
 * Reports that a feed card was actually looked at.
 *
 * There is no post page to instrument: Discover is a grid, so "viewed this
 * post" means the card was on screen long enough to be read. The client
 * decides that (see `PostViewTracker`) and this endpoint only decides
 * whether the report is worth a row.
 *
 * It answers 204 to everything, including failures. The caller is a
 * fire-and-forget beacon that ignores the body, and a scroll that produces a
 * hundred of these must not produce a hundred JSON payloads.
 */

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

const NO_CONTENT = {
    status: 204,
};

function ignored() {
    return new NextResponse(
        null,
        NO_CONTENT
    );
}

export async function POST(
    request: NextRequest,
    context: RouteContext
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return ignored();
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return ignored();
    }

    const { id } =
        await context.params;

    /*
     * A post id is a cuid and the tracker only ever reports ids it was
     * handed, so anything shaped differently is someone probing the route.
     * Rejecting on shape keeps a scan from costing a query per hit.
     */
    if (!/^[a-z0-9]{10,40}$/i.test(id)) {
        return ignored();
    }

    try {
        await recordPostView(
            id,
            session.discordId
        );
    } catch {
        /*
         * Analytics is never worth an error state in the feed. A dropped
         * view undercounts; it does not mislead.
         */
    }

    return ignored();
}
