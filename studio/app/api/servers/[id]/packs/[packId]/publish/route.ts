import {
    handleRouteError,
} from "../../../../../../../lib/apiError";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    publishPackToFeed,
    unpublishPackFromFeed,
} from "../../../../../../../lib/aestheticPacks";

import {
    guardGuildAccessWithSession,
} from "../../../../../../../lib/guildAccess";

import {
    requireFeature,
} from "../../../../../../../lib/gate";

import {
    isGuildInstalled,
} from "../../../../../../../lib/guilds";

import {
    hasSharedItem,
} from "../../../../../../../lib/sharedFeed";

type RouteContext = {
    params: Promise<{
        id: string;
        packId: string;
    }>;
};

/**
 * Publishes one of this server's Aesthetic Packs to Discover.
 *
 * This lives here rather than gaining a `PACK` branch in `POST /api/feed` for
 * two reasons:
 *
 * 1. Entitlement is a Discord permission (MANAGE_GUILD/ADMINISTRATOR), not an
 *    ownership row. `guardGuildAccessWithSession()` resolves that from
 *    Discord's own bitfield; the feed route has no guild to check against.
 * 2. The pack id is only meaningful inside a guild, so the route must resolve
 *    it guild-scopically before anything is inserted — `SharedPost.itemId` has
 *    no foreign key and cannot enforce that itself.
 *
 * The publisher spends their own weekly publication allowance and becomes the
 * post's author, because `SharedPost` has one author column and a guild cannot
 * fill it. The Discover card shows the server's name and icon so the pack
 * still reads as that community's work.
 */
export async function POST(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const {
        id: guildId,
        packId,
    } =
        await params;

    const access =
        await guardGuildAccessWithSession(
            request,
            guildId
        );

    if (access.response) {
        return access.response;
    }

    if (!(await isGuildInstalled(guildId))) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic King is not installed in this server.",
            },
            { status: 400 }
        );
    }

    let caption: string | null = null;

    try {
        const body =
            await request.json() as {
                caption?: string;
            };

        caption =
            body.caption?.trim() || null;
    } catch {
        // No body is fine — the pack's own description is used instead.
    }

    try {
        // Re-publishing refreshes the existing post rather than publishing a
        // second one, so it must not charge a second publication.
        const alreadyShared =
            await hasSharedItem(
                access.session.discordId,
                {
                    itemType: "PACK",
                    itemId: packId,
                }
            );

        if (!alreadyShared) {
            const gate =
                await requireFeature(
                    access.session.discordId,
                    "COMMUNITY_PUBLISH_LIMIT"
                );

            if (!gate.allowed) {
                return gate.response;
            }
        }

        const post =
            await publishPackToFeed(
                guildId,
                access.session.discordId,
                packId,
                caption
            );

        return NextResponse.json({
            success: true,
            post,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not publish Aesthetic Pack."
        );
    }
}

/**
 * Takes a pack back down from Discover.
 *
 * Deliberately not restricted to whoever published it: that member may have
 * left the server, and whoever manages it now still has to be able to remove
 * it. The guild permission check is the authority here, not authorship.
 */
export async function DELETE(
    request: NextRequest,
    {
        params,
    }: RouteContext
) {
    const {
        id: guildId,
        packId,
    } =
        await params;

    const access =
        await guardGuildAccessWithSession(
            request,
            guildId
        );

    if (access.response) {
        return access.response;
    }

    try {
        const removed =
            await unpublishPackFromFeed(
                guildId,
                packId
            );

        return NextResponse.json({
            success: true,
            removed,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not unpublish Aesthetic Pack."
        );
    }
}
