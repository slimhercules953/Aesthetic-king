import {
    query,
} from "./database";

export type SavedAesthetic = {
    id: string;
    generationId: string | null;

    name: string;

    aestheticId: string;
    moodId: string | null;
    colorFilter: string | null;

    profileSetId: string | null;

    usernameIdea: string | null;
    bio: string | null;
    status: string | null;

    symbols: string[];
    palette: string[];

    createdAt: Date;
    updatedAt: Date;
};

export async function getSavedAestheticsByDiscordId(
    discordId: string
): Promise<SavedAesthetic[]> {
    const result =
        await query<SavedAesthetic>(
            `
            SELECT
                sa.id,
                sa."generationId",
                sa.name,
                sa."aestheticId",
                sa."moodId",
                sa."colorFilter",
                sa."profileSetId",
                sa."usernameIdea",
                sa.bio,
                sa.status,
                sa.symbols,
                sa.palette,
                sa."createdAt",
                sa."updatedAt"
            FROM "SavedAesthetic" sa
            INNER JOIN "User" u
                ON u.id = sa."userId"
            WHERE
                u."discordId" = $1
            ORDER BY
                sa."updatedAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}

export async function getSavedAestheticByIdForDiscordUser(
    id: string,
    discordId: string
): Promise<SavedAesthetic | null> {
    const result =
        await query<SavedAesthetic>(
            `
            SELECT
                sa.id,
                sa."generationId",
                sa.name,
                sa."aestheticId",
                sa."moodId",
                sa."colorFilter",
                sa."profileSetId",
                sa."usernameIdea",
                sa.bio,
                sa.status,
                sa.symbols,
                sa.palette,
                sa."createdAt",
                sa."updatedAt"
            FROM "SavedAesthetic" sa
            INNER JOIN "User" u
                ON u.id = sa."userId"
            WHERE
                sa.id = $1
                AND u."discordId" = $2
            LIMIT 1
            `,
            [
                id,
                discordId,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

export async function renameSavedAestheticForDiscordUser(
    id: string,
    discordId: string,
    name: string
): Promise<SavedAesthetic | null> {
    const trimmedName =
        name.trim();

    if (!trimmedName) {
        throw new Error(
            "Aesthetic name is required."
        );
    }

    const result =
        await query<SavedAesthetic>(
            `
            UPDATE "SavedAesthetic" sa
            SET
                name = $3,
                "updatedAt" = NOW()
            FROM "User" u
            WHERE
                sa.id = $1
                AND sa."userId" = u.id
                AND u."discordId" = $2
            RETURNING
                sa.id,
                sa."generationId",
                sa.name,
                sa."aestheticId",
                sa."moodId",
                sa."colorFilter",
                sa."profileSetId",
                sa."usernameIdea",
                sa.bio,
                sa.status,
                sa.symbols,
                sa.palette,
                sa."createdAt",
                sa."updatedAt"
            `,
            [
                id,
                discordId,
                trimmedName,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

export async function deleteSavedAestheticForDiscordUser(
    id: string,
    discordId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "SavedAesthetic" sa
            USING "User" u
            WHERE
                sa.id = $1
                AND sa."userId" = u.id
                AND u."discordId" = $2
            RETURNING sa.id
            `,
            [
                id,
                discordId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}