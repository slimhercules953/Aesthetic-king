import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    shareItemToFeed,
    type SharedItemType,
} from "../../../lib/sharedFeed";

const VALID_ITEM_TYPES: SharedItemType[] = [
    "AESTHETIC",
    "PALETTE",
    "ASSET",
];

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

    let body: {
        itemType?: string;
        itemId?: string;
        caption?: string;
        tags?: string[];
    };

    try {
        body =
            await request.json();
    } catch {
        return NextResponse.json(
            {
                error:
                    "Invalid JSON body.",
            },
            {
                status: 400,
            }
        );
    }

    const itemType =
        body.itemType as
            SharedItemType | undefined;

    if (
        !itemType ||
        !VALID_ITEM_TYPES.includes(itemType)
    ) {
        return NextResponse.json(
            {
                error:
                    "itemType must be AESTHETIC, PALETTE or ASSET.",
            },
            {
                status: 400,
            }
        );
    }

    if (!body.itemId) {
        return NextResponse.json(
            {
                error:
                    "itemId is required.",
            },
            {
                status: 400,
            }
        );
    }

    try {
        const post =
            await shareItemToFeed(
                session.discordId,
                {
                    itemType,
                    itemId: body.itemId,
                    caption:
                        body.caption ?? null,
                    tags:
                        body.tags ?? [],
                }
            );

        return NextResponse.json({
            success: true,
            post,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unable to share item.",
            },
            {
                status: 400,
            }
        );
    }
}
