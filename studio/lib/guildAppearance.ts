import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

/**
 * Per-server presentation of the bot's output.
 *
 * These live on `GuildSettings` rather than in their own table because they
 * are read together with the generation channel and defaults on every reply
 * the bot posts — a second round trip per embed would be paid by every
 * command for data that changes almost never.
 */
export type GuildAppearance = {
    embedColor: string | null;
    footerText: string | null;
    showPackBadge: boolean;
    showGeneratedImages: boolean;
    showRerollButtons: boolean;
};

const SELECT_FIELDS = `
    "embedColor",
    "footerText",
    "showPackBadge",
    "showGeneratedImages",
    "showRerollButtons"
`;

const FALLBACK: GuildAppearance = {
    embedColor: null,
    footerText: null,
    showPackBadge: true,
    showGeneratedImages: true,
    showRerollButtons: true,
};

/**
 * A server with no settings row yet is not an error — the bot works fine
 * before anyone opens Studio, and so does this page. Defaults are returned so
 * the form renders rather than showing a blank color swatch.
 */
export async function getGuildAppearance(
    discordGuildId: string
): Promise<GuildAppearance> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const result =
        await query<GuildAppearance>(
            `
                SELECT
                    ${SELECT_FIELDS}
                FROM "GuildSettings" s
                INNER JOIN "Guild" g
                    ON g.id = s."guildId"
                WHERE g."discordId" = $1
                LIMIT 1
            `,
            [discordGuildId]
        );

    const row = result.rows[0];

    if (!row) {
        return { ...FALLBACK };
    }

    return {
        embedColor: row.embedColor ?? null,
        footerText: row.footerText ?? null,

        showPackBadge:
            row.showPackBadge ?? true,

        showGeneratedImages:
            row.showGeneratedImages ?? true,

        showRerollButtons:
            row.showRerollButtons ?? true,
    };
}

const HEX_COLOR =
    /^#?[0-9a-fA-F]{6}$/;

/**
 * Discord rejects an out-of-range color number, and a 3-digit shorthand or
 * an `rgb()` string would be stored happily and then break every embed.
 * Normalising here means the bot can pass the value straight through.
 */
function normaliseEmbedColor(
    value: unknown
): string | null {
    if (value === null) {
        return null;
    }

    if (typeof value !== "string") {
        throw new ExpectedError(
            "Embed color must be a hex value like #7C5CFF."
        );
    }

    const trimmed = value.trim();

    if (trimmed === "") {
        return null;
    }

    if (!HEX_COLOR.test(trimmed)) {
        throw new ExpectedError(
            "Embed color must be a 6-digit hex value like #7C5CFF."
        );
    }

    return trimmed.startsWith("#")
        ? trimmed
        : `#${trimmed}`;
}

function normaliseFooterText(
    value: unknown
): string | null {
    if (value === null) {
        return null;
    }

    if (typeof value !== "string") {
        throw new ExpectedError(
            "Footer text must be text."
        );
    }

    const trimmed = value.trim();

    if (trimmed === "") {
        return null;
    }

    /*
     * Discord caps embed footers at 2048 characters, but a footer longer than
     * a short sentence looks broken long before that. Truncating rather than
     * rejecting keeps the save button working while the owner types.
     */
    return trimmed.slice(0, 120);
}

function normaliseFlag(
    value: unknown,
    field: string
): boolean {
    if (typeof value !== "boolean") {
        throw new ExpectedError(
            `${field} must be true or false.`
        );
    }

    return value;
}

/**
 * Partial update: only keys present in `patch` are written.
 *
 * The `hasOwnProperty` test is what lets the UI save one toggle without
 * resending — and therefore resetting — the other four.
 */
export async function updateGuildAppearance(
    discordGuildId: string,
    patch: Record<string, unknown>
): Promise<GuildAppearance> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const has = (key: string) =>
        Object.prototype.hasOwnProperty.call(
            patch,
            key
        );

    const sets: string[] = [];
    const values: unknown[] = [discordGuildId];

    if (has("embedColor")) {
        values.push(
            normaliseEmbedColor(patch.embedColor)
        );

        sets.push(
            `"embedColor" = $${values.length}`
        );
    }

    if (has("footerText")) {
        values.push(
            normaliseFooterText(patch.footerText)
        );

        sets.push(
            `"footerText" = $${values.length}`
        );
    }

    if (has("showPackBadge")) {
        values.push(
            normaliseFlag(
                patch.showPackBadge,
                "Show pack badge"
            )
        );

        sets.push(
            `"showPackBadge" = $${values.length}`
        );
    }

    if (has("showGeneratedImages")) {
        values.push(
            normaliseFlag(
                patch.showGeneratedImages,
                "Show generated images"
            )
        );

        sets.push(
            `"showGeneratedImages" = $${values.length}`
        );
    }

    if (has("showRerollButtons")) {
        values.push(
            normaliseFlag(
                patch.showRerollButtons,
                "Show reroll buttons"
            )
        );

        sets.push(
            `"showRerollButtons" = $${values.length}`
        );
    }

    if (sets.length === 0) {
        return getGuildAppearance(discordGuildId);
    }

    /*
     * The insert branch lists only the columns being set, so an untouched
     * presentation column keeps its schema default instead of being silently
     * written as NULL. Postgres fills omitted columns from the DEFAULT clause.
     *
     * `createdAt` and `updatedAt` have to be listed explicitly: `updatedAt` is
     * `@updatedAt` in Prisma, which is a client-side convention, so the column
     * is NOT NULL with no database default and the insert would otherwise fail
     * with a 23502 constraint violation.
     */
    const insertColumns = [
        'id',
        '"guildId"',
        '"createdAt"',
        '"updatedAt"',
        ...sets.map(
            (clause) =>
                clause.split(" = ")[0]
        ),
    ];

    const insertValues = [
        "gen_random_uuid()::text",
        "g.id",
        "NOW()",
        "NOW()",
        ...sets.map(
            (_, index) =>
                `$${index + 2}`
        ),
    ];

    const result =
        await query<GuildAppearance>(
            `
                INSERT INTO "GuildSettings" (
                    ${insertColumns.join(", ")}
                )
                SELECT
                    ${insertValues.join(", ")}
                FROM "Guild" g
                WHERE g."discordId" = $1
                ON CONFLICT ("guildId")
                DO UPDATE SET
                    ${sets.join(", ")},
                    "updatedAt" = NOW()
                RETURNING
                    ${SELECT_FIELDS}
            `,
            values
        );

    const row = result.rows[0];

    if (!row) {
        throw new ExpectedError(
            "Aesthetic King is not installed in this Discord server."
        );
    }

    return {
        embedColor: row.embedColor ?? null,
        footerText: row.footerText ?? null,

        showPackBadge:
            row.showPackBadge ?? true,

        showGeneratedImages:
            row.showGeneratedImages ?? true,

        showRerollButtons:
            row.showRerollButtons ?? true,
    };
}
