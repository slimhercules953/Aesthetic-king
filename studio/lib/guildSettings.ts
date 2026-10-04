import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

export type GuildSettings = {
    id: string;
    guildId: string;

    defaultAestheticId:
    string | null;

    defaultMoodId:
    string | null;

    generationChannelId:
    string | null;

    createdAt: Date;
    updatedAt: Date;
};

type GuildSettingsRow = GuildSettings;

/**
 * The columns a caller may change in one round trip. A key that is
 * absent is left alone; a key present with `null` is cleared.
 */
export type GuildSettingsPatch = {
    generationChannelId?:
    string | null;

    defaultAestheticId?:
    string | null;

    defaultMoodId?:
    string | null;
};

/**
 * Which patch key maps to which column. Written as a list so the
 * statement, the parameter order and the `ON CONFLICT` clause are all
 * generated from one source and cannot drift apart.
 */
const PATCHABLE_FIELDS = [
    {
        key: "generationChannelId",
        column: '"generationChannelId"',
    },
    {
        key: "defaultAestheticId",
        column: '"defaultAestheticId"',
    },
    {
        key: "defaultMoodId",
        column: '"defaultMoodId"',
    },
] as const satisfies ReadonlyArray<{
    key: keyof GuildSettingsPatch;
    column: string;
}>;

export async function getGuildSettingsByDiscordId(
    discordGuildId: string
): Promise<GuildSettings | null> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const result =
        await query<GuildSettingsRow>(
            `
                SELECT
                    s.id,
                    s."guildId",
                    s."defaultAestheticId",
                    s."defaultMoodId",
                    s."generationChannelId",
                    s."createdAt",
                    s."updatedAt"

                FROM "GuildSettings" s

                INNER JOIN "Guild" g
                    ON g.id =
                        s."guildId"

                WHERE
                    g."discordId" =
                        $1

                LIMIT 1
            `,
            [
                discordGuildId,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

/**
 * Applies a patch to a guild's settings in one statement.
 *
 * The three columns used to have one updater each, and the Studio's
 * settings form sends all three fields on every save. Whichever updater
 * ran last won, so saving a default mood and a default aesthetic
 * together silently dropped the mood. Building the statement from the
 * keys the caller actually sent fixes that and keeps a partial patch
 * from clearing columns the caller never mentioned.
 *
 * The column names come from PATCHABLE_FIELDS, never from the caller,
 * so the string interpolation below cannot be injected into.
 */
export async function updateGuildSettings(
    discordGuildId: string,
    patch: GuildSettingsPatch
): Promise<GuildSettings> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const fields = PATCHABLE_FIELDS.filter(
        (field) =>
            Object.prototype.hasOwnProperty.call(
                patch,
                field.key
            )
    );

    if (fields.length === 0) {
        throw new ExpectedError(
            "No supported server setting was provided."
        );
    }

    /*
     * $1 is always the guild's Discord ID, so the parameter for each
     * patched column starts at $2 and follows PATCHABLE_FIELDS order.
     */
    const values: unknown[] = [discordGuildId];

    const columns = ["id", '"guildId"'];
    const selections = ["gen_random_uuid()::text", "g.id"];
    const updates: string[] = [];

    for (const field of fields) {
        values.push(patch[field.key] ?? null);

        columns.push(field.column);
        selections.push(`$${values.length}`);
        updates.push(
            `${field.column} = EXCLUDED.${field.column}`
        );
    }

    columns.push('"createdAt"', '"updatedAt"');
    selections.push("NOW()", "NOW()");
    updates.push('"updatedAt" = NOW()');

    const result =
        await query<GuildSettingsRow>(
            `
                INSERT INTO "GuildSettings" (
                    ${columns.join(", ")}
                )

                SELECT
                    ${selections.join(", ")}

                FROM "Guild" g

                WHERE
                    g."discordId" = $1

                ON CONFLICT ("guildId")
                DO UPDATE SET
                    ${updates.join(", ")}

                RETURNING
                    id,
                    "guildId",
                    "defaultAestheticId",
                    "defaultMoodId",
                    "generationChannelId",
                    "createdAt",
                    "updatedAt"
            `,
            values
        );

    const settings =
        result.rows[0];

    if (!settings) {
        throw new ExpectedError(
            "Aesthetic King is not installed in this Discord server."
        );
    }

    return settings;
}
