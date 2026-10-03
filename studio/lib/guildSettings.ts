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

export async function updateGenerationChannel(
    discordGuildId: string,
    generationChannelId:
        string | null
): Promise<GuildSettings> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const result =
        await query<GuildSettingsRow>(
            `
                INSERT INTO "GuildSettings" (
                    id,
                    "guildId",
                    "generationChannelId",
                    "createdAt",
                    "updatedAt"
                )

                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    NOW(),
                    NOW()

                FROM "Guild" g

                WHERE
                    g."discordId" =
                        $1

                ON CONFLICT ("guildId")
                DO UPDATE SET
                    "generationChannelId" =
                        EXCLUDED."generationChannelId",

                    "updatedAt" =
                        NOW()

                RETURNING
                    id,
                    "guildId",
                    "defaultAestheticId",
                    "defaultMoodId",
                    "generationChannelId",
                    "createdAt",
                    "updatedAt"
            `,
            [
                discordGuildId,
                generationChannelId,
            ]
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

export async function updateDefaultAesthetic(
    discordGuildId: string,
    defaultAestheticId:
        string | null
): Promise<GuildSettings> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const result =
        await query<GuildSettingsRow>(
            `
                INSERT INTO "GuildSettings" (
                    id,
                    "guildId",
                    "defaultAestheticId",
                    "createdAt",
                    "updatedAt"
                )

                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    NOW(),
                    NOW()

                FROM "Guild" g

                WHERE
                    g."discordId" =
                        $1

                ON CONFLICT ("guildId")
                DO UPDATE SET
                    "defaultAestheticId" =
                        EXCLUDED."defaultAestheticId",

                    "updatedAt" =
                        NOW()

                RETURNING
                    id,
                    "guildId",
                    "defaultAestheticId",
                    "defaultMoodId",
                    "generationChannelId",
                    "createdAt",
                    "updatedAt"
            `,
            [
                discordGuildId,
                defaultAestheticId,
            ]
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

export async function updateDefaultMood(
    discordGuildId: string,
    defaultMoodId:
        string | null
): Promise<GuildSettings> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const result =
        await query<GuildSettingsRow>(
            `
                INSERT INTO "GuildSettings" (
                    id,
                    "guildId",
                    "defaultMoodId",
                    "createdAt",
                    "updatedAt"
                )

                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    NOW(),
                    NOW()

                FROM "Guild" g

                WHERE
                    g."discordId" =
                        $1

                ON CONFLICT ("guildId")
                DO UPDATE SET
                    "defaultMoodId" =
                        EXCLUDED."defaultMoodId",

                    "updatedAt" =
                        NOW()

                RETURNING
                    id,
                    "guildId",
                    "defaultAestheticId",
                    "defaultMoodId",
                    "generationChannelId",
                    "createdAt",
                    "updatedAt"
            `,
            [
                discordGuildId,
                defaultMoodId,
            ]
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