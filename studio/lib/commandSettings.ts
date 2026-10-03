import {
    ExpectedError,
} from "./apiError";

import { query } from "./database";

type GuildCommandSettingRow = {
    commandName: string;
    enabled: boolean;
};

export async function getGuildCommandSettings(
    discordGuildId: string
): Promise<Record<string, boolean>> {
    const result = await query<GuildCommandSettingRow>(
        `
        SELECT
            s."commandName",
            s.enabled
        FROM "GuildCommandSetting" s
        INNER JOIN "Guild" g
            ON g.id = s."guildId"
        WHERE g."discordId" = $1
        `,
        [discordGuildId]
    );

    return Object.fromEntries(
        result.rows.map((row) => [
            row.commandName,
            row.enabled,
        ])
    );
}

export async function setGuildCommandEnabled(
    discordGuildId: string,
    commandName: string,
    enabled: boolean
) {
    const result = await query<GuildCommandSettingRow>(
        `
        INSERT INTO "GuildCommandSetting" (
            id,
            "guildId",
            "commandName",
            enabled,
            "createdAt",
            "updatedAt"
        )
        SELECT
            gen_random_uuid()::text,
            g.id,
            $2,
            $3,
            NOW(),
            NOW()
        FROM "Guild" g
        WHERE g."discordId" = $1
        ON CONFLICT ("guildId", "commandName")
        DO UPDATE SET
            enabled = EXCLUDED.enabled,
            "updatedAt" = NOW()
        RETURNING
            "commandName",
            enabled
        `,
        [
            discordGuildId,
            commandName,
            enabled,
        ]
    );

    const setting = result.rows[0];

    if (!setting) {
        throw new ExpectedError(
            "Aesthetic King is not installed in this Discord server."
        );
    }

    return setting;
}
