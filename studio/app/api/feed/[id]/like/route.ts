import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../lib/session";

import {
    toggleSharedPostLike,
} from "../../../../../lib/sharedFeed";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

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

    const result =
        await toggleSharedPostLike(
            id,
            session.discordId
        );

    if (!result) {
        return NextResponse.json(
            {
                error:
                    "Post not found.",
            },
            {
                status: 404,
            }
        );
    }

    return NextResponse.json({
        success: true,
        liked: result.liked,
        likeCount: result.likeCount,
    });
}
