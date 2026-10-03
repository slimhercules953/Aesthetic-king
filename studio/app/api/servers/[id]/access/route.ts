import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    handleRouteError,
} from "../../../../../lib/apiError";

import {
    guardGuildAccess,
} from "../../../../../lib/guildAccess";

import {
    isGuildInstalled,
} from "../../../../../lib/guilds";

import {
    addAccessRule,
    getAccessRules,
    removeAccessRule,
    replaceAccessRules,
} from "../../../../../lib/guildAccessRules";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

/**
 * Shared preamble: session + guild-management permission, then the install
 * check. `guardGuildAccess` already returns a response on failure, so a
 * `null` here means the caller is authorised.
 */
async function authorise(
    request: NextRequest,
    guildId: string
): Promise<NextResponse | null> {
    const denied = await guardGuildAccess(
        request,
        guildId
    );

    if (denied) {
        return denied;
    }

    if (
        !(await isGuildInstalled(guildId))
    ) {
        return NextResponse.json(
            {
                error:
                    "Aesthetic King is not installed in this server.",
            },
            { status: 400 }
        );
    }

    return null;
}

export async function GET(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await authorise(request, id);

        if (denied) {
            return denied;
        }

        const rules = await getAccessRules(id);

        /*
         * `open` is what the UI headlines: an owner reading an empty list
         * needs to be told it means "everyone can use the bot", not left to
         * infer it.
         */
        return NextResponse.json({
            rules,
            open: rules.length === 0,
        });
    } catch (error) {
        return handleRouteError(
            error,
            500,
            "Could not load access rules."
        );
    }
}

/**
 * Adds one rule.
 *
 * The bot caches rules for ~15s, so a newly added restriction does not apply
 * instantly. That delay is accepted rather than solved by an invalidation
 * channel between Studio and the bot: Studio has no way to reach the bot's
 * process, and fifteen seconds of lag on a permission change is worth far
 * less than the complexity of a pub/sub hop.
 */
export async function POST(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await authorise(request, id);

        if (denied) {
            return denied;
        }

        const body = await request.json() as {
            kind?: unknown;
            effect?: unknown;
            targetId?: unknown;
        };

        const rule = await addAccessRule(id, body);

        return NextResponse.json({ rule });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not save the access rule."
        );
    }
}

/** Replaces the whole rule set; an empty list means "open to everyone". */
export async function PUT(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await authorise(request, id);

        if (denied) {
            return denied;
        }

        const body = await request.json() as {
            rules?: unknown;
        };

        const rules = await replaceAccessRules(
            id,
            body.rules ?? []
        );

        return NextResponse.json({
            rules,
            open: rules.length === 0,
        });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not save the access rules."
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: RouteContext
) {
    const { id } = await params;

    try {
        const denied = await authorise(request, id);

        if (denied) {
            return denied;
        }

        const { searchParams } =
            new URL(request.url);

        const removed = await removeAccessRule(id, {
            kind: searchParams.get("kind"),
            targetId:
                searchParams.get("targetId"),
        });

        return NextResponse.json({ removed });
    } catch (error) {
        return handleRouteError(
            error,
            400,
            "Could not remove the access rule."
        );
    }
}
