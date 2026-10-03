import {
    query,
} from "./database";

export type ServerAestheticPack = {
    id: string;
    guildId: string;
    name: string;
    description: string | null;
    aestheticId: string | null;
    moodId: string | null;
    colors: string[];
    symbols: string[];
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
};

type AestheticPackRow =
    ServerAestheticPack;

export async function getServerAestheticPacks(
    discordGuildId: string
): Promise<ServerAestheticPack[]> {
    const result =
        await query<AestheticPackRow>(
            `
                SELECT
                    p.id,
                    p."guildId",
                    p.name,
                    p.description,
                    p."aestheticId",
                    p."moodId",
                    p.colors,
                    p.symbols,
                    p.enabled,
                    p."createdAt",
                    p."updatedAt"

                FROM "AestheticPack" p

                INNER JOIN "Guild" g
                    ON g.id =
                        p."guildId"

                WHERE
                    g."discordId" =
                        $1

                ORDER BY
                    p.name ASC
            `,
            [
                discordGuildId,
            ]
        );

    return result.rows;
}

export async function createServerAestheticPack(
    discordGuildId: string,
    input: {
        name: string;
        description?: string | null;
        aestheticId?: string | null;
        moodId?: string | null;
        colors?: string[];
        symbols?: string[];
        enabled?: boolean;
    }
): Promise<ServerAestheticPack> {
    const result =
        await query<AestheticPackRow>(
            `
                INSERT INTO "AestheticPack" (
                    id,
                    "guildId",
                    name,
                    description,
                    "aestheticId",
                    "moodId",
                    colors,
                    symbols,
                    enabled,
                    "createdAt",
                    "updatedAt"
                )

                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    NOW(),
                    NOW()

                FROM "Guild" g

                WHERE
                    g."discordId" =
                        $1

                RETURNING
                    id,
                    "guildId",
                    name,
                    description,
                    "aestheticId",
                    "moodId",
                    colors,
                    symbols,
                    enabled,
                    "createdAt",
                    "updatedAt"
            `,
            [
                discordGuildId,
                input.name,
                input.description ?? null,
                input.aestheticId ?? null,
                input.moodId ?? null,
                input.colors ?? [],
                input.symbols ?? [],
                input.enabled ?? true,
            ]
        );

    const pack =
        result.rows[0];

    if (!pack) {
        throw new Error(
            "Aesthetic King is not installed in this Discord server."
        );
    }

    return pack;
}

export async function updateServerAestheticPack(
    discordGuildId: string,
    packId: string,
    input: {
        name: string;
        description?: string | null;
        aestheticId?: string | null;
        moodId?: string | null;
        colors?: string[];
        symbols?: string[];
        enabled?: boolean;
    }
): Promise<ServerAestheticPack> {
    const result =
        await query<AestheticPackRow>(
            `
                UPDATE "AestheticPack" p

                SET
                    name = $3,
                    description = $4,
                    "aestheticId" = $5,
                    "moodId" = $6,
                    colors = $7,
                    symbols = $8,
                    enabled = $9,
                    "updatedAt" = NOW()

                FROM "Guild" g

                WHERE
                    p.id = $2
                    AND p."guildId" = g.id
                    AND g."discordId" = $1

                RETURNING
                    p.id,
                    p."guildId",
                    p.name,
                    p.description,
                    p."aestheticId",
                    p."moodId",
                    p.colors,
                    p.symbols,
                    p.enabled,
                    p."createdAt",
                    p."updatedAt"
            `,
            [
                discordGuildId,
                packId,
                input.name,
                input.description ?? null,
                input.aestheticId ?? null,
                input.moodId ?? null,
                input.colors ?? [],
                input.symbols ?? [],
                input.enabled ?? true,
            ]
        );

    const pack =
        result.rows[0];

    if (!pack) {
        throw new Error(
            "Aesthetic Pack was not found."
        );
    }

    return pack;
}

export async function deleteServerAestheticPack(
    discordGuildId: string,
    packId: string
) {
    const result =
        await query(
            `
                DELETE FROM "AestheticPack" p

                USING "Guild" g

                WHERE
                    p.id = $2
                    AND p."guildId" = g.id
                    AND g."discordId" = $1
            `,
            [
                discordGuildId,
                packId,
            ]
        );

    if (
        (result.rowCount ?? 0) ===
        0
    ) {
        throw new Error(
            "Aesthetic Pack was not found."
        );
    }
}

export async function getDefaultAestheticPackId(
    discordGuildId: string
): Promise<string | null> {
    const result =
        await query<{
            defaultPackId:
                string | null;
        }>(
            `
                SELECT
                    s."defaultPackId"

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
        result.rows[0]
            ?.defaultPackId ??
        null
    );
}

export async function setDefaultAestheticPack(
    discordGuildId: string,
    packId: string | null
) {
    if (packId) {
        const packResult =
            await query(
                `
                    SELECT
                        p.id

                    FROM "AestheticPack" p

                    INNER JOIN "Guild" g
                        ON g.id =
                            p."guildId"

                    WHERE
                        p.id = $2
                        AND g."discordId" =
                            $1

                    LIMIT 1
                `,
                [
                    discordGuildId,
                    packId,
                ]
            );

        if (
            (packResult.rowCount ??
                0) === 0
        ) {
            throw new Error(
                "Aesthetic Pack was not found."
            );
        }
    }

    const result =
        await query(
            `
                INSERT INTO "GuildSettings" (
                    id,
                    "guildId",
                    "defaultPackId",
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
                    "defaultPackId" =
                        EXCLUDED."defaultPackId",

                    "updatedAt" =
                        NOW()
            `,
            [
                discordGuildId,
                packId,
            ]
        );

    if (
        (result.rowCount ?? 0) ===
        0
    ) {
        throw new Error(
            "Could not update the default Aesthetic Pack."
        );
    }
}
