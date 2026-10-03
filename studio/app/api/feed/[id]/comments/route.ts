import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../../lib/session";

import {
    addSharedPostComment,
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

    let body: {
        body?: string;
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

    const { id } =
        await context.params;

    try {
        const comment =
            await addSharedPostComment(
                id,
                session.discordId,
                body.body ?? ""
            );

        if (!comment) {
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
            comment,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unable to add comment.",
            },
            {
                status: 400,
            }
        );
    }
}
