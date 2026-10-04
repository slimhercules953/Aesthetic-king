import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    countUnread,
    deleteNotification,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "../../../lib/notifications";

/*
 * The bell. GET returns the list plus the unread count in one round trip
 * so opening the dropdown is a single request; PATCH marks read; DELETE
 * removes. All three are scoped to the signed-in account by Discord id —
 * no id in the body is ever trusted to identify an owner.
 */

async function authenticate(
    request: NextRequest
) {
    const cookie =
        request.cookies.get(
            SESSION_COOKIE_NAME
        );

    if (!cookie) return null;

    return await verifySessionToken(
        cookie.value
    );
}

export async function GET(
    request: NextRequest
) {
    const session =
        await authenticate(request);

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const [items, unread] = await Promise.all([
        listNotifications(session.discordId),
        countUnread(session.discordId),
    ]);

    return NextResponse.json({
        items,
        unread,
    });
}

export async function PATCH(
    request: NextRequest
) {
    const session =
        await authenticate(request);

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 }
        );
    }

    const payload = (body ?? {}) as {
        id?: unknown;
        all?: unknown;
    };

    if (payload.all === true) {
        const updated =
            await markAllNotificationsRead(
                session.discordId
            );

        return NextResponse.json({
            success: true,
            updated,
        });
    }

    const id = String(payload.id ?? "").trim();

    if (!id) {
        return NextResponse.json(
            { error: "Missing notification id." },
            { status: 400 }
        );
    }

    const updated =
        await markNotificationRead(
            id,
            session.discordId
        );

    return NextResponse.json({
        success: true,
        updated,
    });
}

export async function DELETE(
    request: NextRequest
) {
    const session =
        await authenticate(request);

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const id = new URL(
        request.url
    ).searchParams.get("id");

    if (!id) {
        return NextResponse.json(
            { error: "Missing notification id." },
            { status: 400 }
        );
    }

    const deleted =
        await deleteNotification(
            id,
            session.discordId
        );

    return NextResponse.json({
        success: true,
        deleted,
    });
}
