import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

import {
    canBotManageRoles,
    createGuildRole,
} from "./discordBot";

/**
 * Cosmetic roles created from Server Studio > Appearance > Role maker.
 *
 * A "cosmetic" role is one that grants nothing: no permissions, no hoisting,
 * not mentionable. It exists purely to put a coloured name in the member list
 * and in chat. That is also what keeps the feature safe — nothing here can
 * hand out powers, only paint.
 *
 * The role itself lives on Discord. This module validates input, delegates the
 * write to `discordBot.createGuildRole`, and keeps the receipt (see the
 * `GuildCosmeticRole` model) so an owner can see which roles the tool made.
 */

/** Discord's own limit on a role name. */
export const MAX_ROLE_NAME_LENGTH = 100;

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Accepts `#RRGGBB` or bare `RRGGBB` and returns the uppercase `#` form.
 *
 * Throws `ExpectedError` because this runs on whatever the owner typed.
 */
export function normalizeRoleColor(
    value: unknown
): string {
    if (typeof value !== "string") {
        throw new ExpectedError(
            "Pick a color for the role."
        );
    }

    let candidate = value.trim();

    if (candidate && candidate !== "#" && !candidate.startsWith("#")) {
        candidate = `#${candidate}`;
    }

    if (!HEX_PATTERN.test(candidate)) {
        throw new ExpectedError(
            "Use a six-digit hex color like #C084FC."
        );
    }

    return candidate.toUpperCase();
}

/**
 * `#C084FC` → `12617468`, the integer Discord stores.
 *
 * `#000000` is rejected rather than mapped: Discord reserves color `0` for
 * "no role color" and renders it as the default grey, so a role created with
 * pure black silently looks like it has no color at all. Saying so is kinder
 * than shipping a role that appears broken.
 */
export function roleColorToInt(
    hex: unknown
): number {
    const normalized = normalizeRoleColor(hex);

    if (normalized === "#000000") {
        throw new ExpectedError(
            "Pure black shows up as Discord's default grey. Pick #010101 or another color."
        );
    }

    return parseInt(normalized.slice(1), 16);
}

export function roleColorFromInt(
    value: number
): string {
    const clamped =
        Number.isFinite(value) && value > 0 && value <= 0xffffff
            ? Math.trunc(value)
            : 0;

    return `#${clamped.toString(16).padStart(6, "0").toUpperCase()}`;
}

/**
 * Contrast between a role color and Discord's two message backgrounds.
 *
 * Discord renders a colored role name in the role color itself, on either the
 * dark (~#313338) or light (~#F2F3F5) theme. A color that only clears one of
 * them is unreadable for part of the server, which is how "nobody can see my
 * role" complaints start.
 */
export function roleColorReadability(
    hex: string
): {
    onDark: number;
    onLight: number;
    readable: boolean;
} {
    const normalized = normalizeRoleColor(hex);
    const { r, g, b } = hexToRgb(normalized);

    const onDark = contrastAgainst(
        r,
        g,
        b,
        0x31,
        0x33,
        0x38
    );

    const onLight = contrastAgainst(
        r,
        g,
        b,
        0xf2,
        0xf3,
        0xf5
    );

    return {
        onDark: Math.round(onDark * 100) / 100,
        onLight: Math.round(onLight * 100) / 100,

        /*
         * 4.5:1 is WCAG AA for normal text, which is the right bar here: a
         * role name is rendered at body size, and Discord's two backgrounds
         * are far enough apart that anything below this is genuinely a squint
         * on one of the themes.
         */
        readable: onDark >= 4.5 || onLight >= 4.5,
    };
}

function hexToRgb(hex: string): {
    r: number;
    g: number;
    b: number;
} {
    const value = parseInt(hex.slice(1), 16);

    return {
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff,
    };
}

function channelLuminance(
    channel: number
): number {
    const srgb = channel / 255;

    return srgb <= 0.03928
        ? srgb / 12.92
        : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function contrastAgainst(
    r: number,
    g: number,
    b: number,
    br: number,
    bg: number,
    bb: number
): number {
    const first =
        0.2126 * channelLuminance(r) +
        0.7152 * channelLuminance(g) +
        0.0722 * channelLuminance(b);

    const second =
        0.2126 * channelLuminance(br) +
        0.7152 * channelLuminance(bg) +
        0.0722 * channelLuminance(bb);

    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);

    return (lighter + 0.05) / (darker + 0.05);
}

function normalizeRoleName(
    value: unknown
): string {
    if (typeof value !== "string") {
        throw new ExpectedError(
            "Give the role a name."
        );
    }

    /*
     * Discord rejects control characters outright, and an owner pasting from a
     * design doc hits that before they hit the length limit.
     */
    const name = value
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();

    if (!name) {
        throw new ExpectedError(
            "Give the role a name."
        );
    }

    if (name.length > MAX_ROLE_NAME_LENGTH) {
        throw new ExpectedError(
            `A role name is at most ${MAX_ROLE_NAME_LENGTH} characters.`
        );
    }

    /*
     * Discord will not name a role @everyone or @here, and both ping in some
     * clients regardless of the role's own permissions.
     */
    const lower = name.toLowerCase().replace(/^@/, "");

    if (lower === "everyone" || lower === "here") {
        throw new ExpectedError(
            "A role cannot be named everyone or here."
        );
    }

    return name;
}

/* ------------------------------------------------------------------ *
 * Creating a role
 * ------------------------------------------------------------------ */

export type CreatedRole = {
    id: string;
    name: string;
    color: string;
};

export type CreateRoleResult =
    | { ok: true; role: CreatedRole }
    | { ok: false; error: string };

/**
 * Validates the owner's input, then asks Discord for the role.
 *
 * Validation lives here rather than in the route so the same rules apply
 * however this gets called, and so a bad hex never reaches Discord — a 400
 * from Discord comes back as an opaque English sentence, whereas our own
 * message can say exactly what to type.
 */
export async function createCosmeticRole(
    guildId: string,
    input: {
        name?: unknown;
        color?: unknown;
    }
): Promise<CreateRoleResult> {
    let name: string;
    let color: number;

    try {
        name = normalizeRoleName(input.name);
        color = roleColorToInt(input.color);
    } catch (error) {
        /*
         * Validation messages are `ExpectedError`s written for the owner, so
         * surface their text; anything unexpected stays generic.
         */
        return {
            ok: false,
            error:
                error instanceof ExpectedError
                    ? error.message
                    : "That role could not be created.",
        };
    }

    const result = await createGuildRole(
        guildId,
        { name, color }
    );

    if (!result.ok) {
        return result;
    }

    return {
        ok: true,
        role: {
            id: result.role.id,
            name,
            color: roleColorFromInt(color),
        },
    };
}

/**
 * Whether the role maker can work here, and why not if it cannot.
 *
 * `canManageRoles: null` means we could not ask Discord at all, which the UI
 * renders as "unavailable" rather than "not allowed" — the difference matters,
 * because one is fixed by re-inviting the bot and the other is not.
 */
export async function getRoleToolStatus(
    guildId: string
): Promise<{
    canRead: boolean;
    canManageRoles: boolean | null;
}> {
    const canManageRoles = await canBotManageRoles(
        guildId
    ).catch(() => null);

    return {
        canRead: canManageRoles !== null,
        canManageRoles,
    };
}

/* ------------------------------------------------------------------ *
 * The receipt table
 * ------------------------------------------------------------------ */

export type CosmeticRoleRecord = {
    id: string;
    discordRoleId: string;
    name: string;
    color: string;
    createdAt: string;
};

type CosmeticRoleRow = {
    id: string;
    discordRoleId: string;
    name: string;
    color: string;
    createdAt: Date | string;
};

function requireGuildId(
    discordGuildId: string
) {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }
}

function toRecord(
    row: CosmeticRoleRow
): CosmeticRoleRecord {
    return {
        id: row.id,
        discordRoleId: row.discordRoleId,
        name: row.name,
        color: row.color,
        createdAt:
            row.createdAt instanceof Date
                ? row.createdAt.toISOString()
                : String(row.createdAt),
    };
}

/**
 * Roles this tool created in a server, newest first.
 *
 * The list is a convenience, not a source of truth — the route reads it
 * defensively so a database hiccup never takes the Appearance tab down.
 */
export async function listCosmeticRoles(
    discordGuildId: string
): Promise<CosmeticRoleRecord[]> {
    requireGuildId(discordGuildId);

    const result =
        await query<CosmeticRoleRow>(
            `
                SELECT
                    r.id,
                    r."discordRoleId",
                    r.name,
                    r.color,
                    r."createdAt"
                FROM "GuildCosmeticRole" r
                INNER JOIN "Guild" g
                    ON g.id = r."guildId"
                WHERE g."discordId" = $1
                ORDER BY r."createdAt" DESC
                LIMIT 50
            `,
            [discordGuildId]
        );

    return result.rows.map(toRecord);
}

/**
 * Records a created role.
 *
 * Best-effort by contract: the role already exists on Discord by the time this
 * runs, so losing the receipt must not be reported to the owner as a failure.
 * The unique index makes a replayed request an update rather than a duplicate.
 */
export async function recordCosmeticRole(
    discordGuildId: string,
    role: CreatedRole,
    createdBy: string | null
): Promise<CosmeticRoleRecord | null> {
    requireGuildId(discordGuildId);

    const result =
        await query<CosmeticRoleRow>(
            `
                INSERT INTO "GuildCosmeticRole" (
                    id,
                    "guildId",
                    "discordRoleId",
                    name,
                    color,
                    "createdBy",
                    "createdAt"
                )
                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    $3,
                    $4,
                    $5,
                    NOW()
                FROM "Guild" g
                WHERE g."discordId" = $1
                ON CONFLICT ("guildId", "discordRoleId")
                DO UPDATE SET
                    name = EXCLUDED.name,
                    color = EXCLUDED.color
                RETURNING
                    id,
                    "discordRoleId",
                    name,
                    color,
                    "createdAt"
            `,
            [
                discordGuildId,
                role.id,
                role.name,
                role.color,
                createdBy,
            ]
        );

    const row = result.rows[0];

    return row ? toRecord(row) : null;
}

/**
 * Forgets the receipt for a role.
 *
 * This never deletes the Discord role — an owner who removes a role does it in
 * Discord, and this only clears the row once the role is gone.
 */
export async function forgetCosmeticRole(
    discordGuildId: string,
    recordId: string
): Promise<boolean> {
    requireGuildId(discordGuildId);

    if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(recordId ?? ""))) {
        throw new ExpectedError(
            "That role entry is not valid."
        );
    }

    const result =
        await query<{ id: string }>(
            `
                DELETE FROM "GuildCosmeticRole" r
                USING "Guild" g
                WHERE r."guildId" = g.id
                  AND g."discordId" = $1
                  AND r.id = $2
                RETURNING r.id
            `,
            [discordGuildId, recordId]
        );

    return result.rows.length > 0;
}
