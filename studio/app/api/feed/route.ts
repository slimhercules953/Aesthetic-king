import {
    handleRouteError,
} from "../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    requireFeature,
} from "../../../lib/gate";

import {
    hasSharedItem,
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

    // Re-sharing an item that is already in the feed updates the
    // existing post instead of publishing a new one, so it must not
    // consume the weekly publish allowance.
    const alreadyShared =
        await hasSharedItem(
            session.discordId,
            {
                itemType,
                itemId: body.itemId,
            }
        );

    if (!alreadyShared) {
        const gate =
            await requireFeature(
                session.discordId,
                "COMMUNITY_PUBLISH_LIMIT"
            );

        if (!gate.allowed) {
            return gate.response;
        }
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
        return handleRouteError(
            error,
            400,
            "Unable to share item."
        );
    }
}
