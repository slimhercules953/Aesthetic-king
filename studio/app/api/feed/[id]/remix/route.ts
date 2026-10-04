import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../lib/session";

import {
    deniedResponse,
    requireFeature,
} from "../../../../../lib/gate";

import {
    getFeatureAccess,
} from "../../../../../lib/featureAccess";

import {
    premiumSetForPost,
    remixFromPost,
} from "../../../../../lib/remix";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

/**
 * Copies another creator's published post into the caller's library.
 *
 * There is no body: the post id in the URL is the whole request. Anything
 * else (a name, a caption) would invite a client to send values the copy
 * does not use, and the attribution must not be negotiable.
 *
 * The remix is *not* published. It lands in the library and the remixer
 * shares it when they choose, which keeps the weekly publish allowance
 * meaningful and stops a remix button from writing to the feed behind
 * someone's back.
 */
export async function POST(
    request: NextRequest,
    context: RouteContext
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

    const { id } =
        await context.params;

    /*
     * A remix creates a saved item, so it spends the same allowance saving
     * one does. Checking before the copy, rather than letting the insert
     * overflow the limit, is the difference between an upsell and a library
     * that quietly ignores the cap.
     */
    const gate =
        await requireFeature(
            session.discordId,
            "SAVED_PROFILE_LIMIT"
        );

    if (!gate.allowed) {
        return gate.response;
    }

    /*
     * The artwork being copied may be a premium set, and publishing someone
     * else's premium set is a use of it — so the entitlement that unlocks
     * saving a set unlocks remixing it. Answering with the upsell body here
     * is why this happens before the copy; `remixFromPost` repeats the check
     * because it does not trust this route.
     */
    let premiumUnlocked = false;

    try {
        const premiumSet =
            await premiumSetForPost(id);

        if (premiumSet) {
            const assetsAccess =
                await getFeatureAccess(
                    session.discordId,
                    "PREMIUM_ASSETS"
                );

            if (!assetsAccess.allowed) {
                return deniedResponse(
                    assetsAccess
                );
            }

            premiumUnlocked = true;
        }

        const result =
            await remixFromPost(
                session.discordId,
                id,
                {
                    premiumUnlocked,
                }
            );

        return NextResponse.json({
            success: true,

            item: {
                itemType:
                    result.itemType,
                itemId:
                    result.itemId,
                name:
                    result.name,
            },

            attribution:
                result.attribution,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Unable to remix this post."
        );
    }
}
