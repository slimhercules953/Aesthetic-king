import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    getDiscordGuilds,
    type DiscordGuild,
} from "./auth";

import {
    getValidDiscordAccessToken,
} from "./discordOAuth";

import {
    isGuildInstalled,
} from "./guilds";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
    type SessionUser,
} from "./session";

const ADMINISTRATOR =
    BigInt(1) << BigInt(3);

const MANAGE_GUILD =
    BigInt(1) << BigInt(5);

export type GuildAccess = {
    session: SessionUser;
    guild: DiscordGuild;
};

/**
 * Whether the signed-in user may configure Aesthetic King in a server.
 *
 * `guild.permissions` is the caller's permission bitfield for that guild as
 * Discord computed it, so MANAGE_GUILD (or ADMIN) is the same bar the
 * Discord-native integration settings use. Ownership short-circuits because
 * owners do not always carry an explicit bitfield.
 */
export function canManageGuild(
    guild: DiscordGuild
): boolean {
    if (guild.owner) {
        return true;
    }

    let permissions: bigint;

    try {
        permissions = BigInt(guild.permissions);
    } catch {
        return false;
    }

    return (
        (permissions & ADMINISTRATOR) !== BigInt(0) ||
        (permissions & MANAGE_GUILD) !== BigInt(0)
    );
}

/**
 * Resolve a session's right to manage a guild, or `null`.
 *
 * Returns `null` for every rejection — no Discord connection, guild not in
 * the user's server list, insufficient permissions — so the caller decides
 * whether that means `notFound()` (a page) or a 401/403 (an API route). A
 * page must not leak that a guild exists but is someone else's, while an API
 * client benefits from knowing which check failed.
 */
async function checkGuildAccess(
    session: SessionUser,
    guildId: string
): Promise<GuildAccess | null> {
    if (!guildId) {
        return null;
    }

    const accessToken =
        await getValidDiscordAccessToken(session.discordId);

    if (!accessToken) {
        return null;
    }

    const guilds =
        await getDiscordGuilds(accessToken);

    const guild = guilds.find(
        (candidate) => candidate.id === guildId
    );

    if (!guild || !canManageGuild(guild)) {
        return null;
    }

    return { session, guild };
}

/**
 * Route-guard form of the guild permission check.
 *
 * Usage: `const denied = await guardGuildAccess(request, id); if (denied)
 * return denied;` — a response is only produced on failure, so `null` means
 * the caller is authorised and may proceed.
 */
export async function guardGuildAccess(
    request: NextRequest,
    guildId: string
): Promise<NextResponse | null> {
    const cookie =
        request.cookies.get(SESSION_COOKIE_NAME);

    if (!cookie) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const session =
        await verifySessionToken(cookie.value);

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    let access: GuildAccess | null;

    try {
        access = await checkGuildAccess(session, guildId);
    } catch (error) {
        // Discord being unreachable, or the stored token being undecryptable,
        // is upstream trouble rather than the caller's fault.
        console.error(
            "Guild access check failed:",
            error instanceof Error ? error.message : error
        );

        return NextResponse.json(
            {
                error:
                    "Could not verify your Discord permissions. Please try again.",
            },
            { status: 502 }
        );
    }

    if (!access) {
        return NextResponse.json(
            {
                error:
                    "You do not have permission to manage this server.",
            },
            { status: 403 }
        );
    }

    return null;
}

/**
 * Page form of {@link guardGuildAccess}: renders 404 instead of 403, and
 * asserts the bot is installed, because every Server Studio tab configures a
 * bot that has to be present to read the settings back.
 *
 * Reads the session through `cookies()` rather than a `NextRequest` because
 * page components are not handed one.
 */
export async function requireManagedGuild(
    guildId: string
): Promise<GuildAccess & { installed: boolean }> {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(SESSION_COOKIE_NAME);

    if (!sessionCookie) {
        notFound();
    }

    const session =
        await verifySessionToken(sessionCookie.value);

    if (!session) {
        notFound();
    }

    const access =
        await checkGuildAccess(session, guildId).catch(
            () => null
        );

    if (!access) {
        notFound();
    }

    const installed =
        await isGuildInstalled(access.guild.id);

    if (!installed) {
        notFound();
    }

    return { ...access, installed };
}
