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
    isPremiumSet,
} from "../../../lib/assetCatalog";

import {
    hasSharedItem,
    isSharedItemType,
    shareItemToFeed,
    type SharedItemType,
} from "../../../lib/sharedFeed";

/**
 * Types this route may publish.
 *
 * `PACK` is a valid `SharedItemType` but is deliberately absent: a pack
 * belongs to a server, so publishing one requires the MANAGE_GUILD check
 * that only the guild-scoped route can perform. It is rejected by name below
 * rather than by the generic "unknown type" message, because someone wiring
 * up a client deserves to be told where packs are published instead.
 */
const ROUTE_ITEM_TYPES: SharedItemType[] = [
    "AESTHETIC",
    "PALETTE",
    "ASSET",
    "PROFILE",
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

    if (itemType === "PACK") {
        return NextResponse.json(
            {
                error:
                    "Aesthetic Packs are published from Server Studio.",
            },
            {
                status: 400,
            }
        );
    }

    if (
        !itemType ||
        !isSharedItemType(itemType) ||
        !ROUTE_ITEM_TYPES.includes(itemType)
    ) {
        return NextResponse.json(
            {
                error:
                    "itemType must be AESTHETIC, PALETTE, ASSET or PROFILE.",
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

    // Publishing someone else's premium artwork is a use of it, so
    // the same entitlement that unlocks saving a set unlocks sharing
    // it. Re-shares are checked too: the post is new either way.
    if (
        itemType === "ASSET" &&
        isPremiumSet(body.itemId)
    ) {
        const assets =
            await requireFeature(
                session.discordId,
                "PREMIUM_ASSETS"
            );

        if (!assets.allowed) {
            return assets.response;
        }
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
