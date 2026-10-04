import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    searchStudio,
} from "../../../lib/search";

/*
 * Backs the topbar search box. GET ?q=term.
 *
 * Short queries return nothing rather than "everything containing 'a'",
 * which keeps a stray keystroke from looking like a broken result list.
 */
export async function GET(
    request: NextRequest
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const session =
        await verifySessionToken(
            cookie.value
        );

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const term = new URL(
        request.url
    ).searchParams.get("q") ?? "";

    const items =
        await searchStudio(session.discordId, term);

    return NextResponse.json({ items });
}
