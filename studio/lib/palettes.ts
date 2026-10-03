import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

export type SavedPalette = {
    id: string;
    name: string | null;
    aestheticId: string | null;
    moodId: string | null;
    colors: string[];
    createdAt: Date;
    updatedAt: Date;
};

export async function getSavedPalettesByDiscordId(
    discordId: string
): Promise<SavedPalette[]> {
    const result =
        await query<SavedPalette>(
            `
            SELECT
                sp.id,
                sp.name,
                sp."aestheticId",
                sp."moodId",
                sp.colors,
                sp."createdAt",
                sp."updatedAt"
            FROM "SavedPalette" sp
            INNER JOIN "User" u
                ON u.id = sp."userId"
            WHERE
                u."discordId" = $1
            ORDER BY
                sp."updatedAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}

export async function createSavedPalette(
    discordId: string,
    input: {
        name?: string | null;
        aestheticId?: string | null;
        moodId?: string | null;
        colors: string[];
    }
): Promise<SavedPalette> {
    const normalizedColors =
        input.colors
            .map(
                (color) =>
                    color
                        .trim()
                        .toUpperCase()
            )
            .filter(Boolean);

    if (
        normalizedColors.length <
        3 ||
        normalizedColors.length >
        6
    ) {
        throw new ExpectedError(
            "A palette must contain between 3 and 6 colors."
        );
    }

    const result =
        await query<SavedPalette>(
            `
            INSERT INTO "SavedPalette" (
                id,
                "userId",
                name,
                "aestheticId",
                "moodId",
                colors,
                "createdAt",
                "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                $2,
                $3,
                $4,
                $5,
                NOW(),
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1
            RETURNING
                id,
                name,
                "aestheticId",
                "moodId",
                colors,
                "createdAt",
                "updatedAt"
            `,
            [
                discordId,
                input.name?.trim() ||
                null,
                input.aestheticId?.trim() ||
                null,
                input.moodId?.trim() ||
                null,
                normalizedColors,
            ]
        );

    const palette =
        result.rows[0];

    if (!palette) {
        throw new ExpectedError(
            "Unable to create palette."
        );
    }

    return palette;
}

export async function renameSavedPalette(
    paletteId: string,
    discordId: string,
    name: string
): Promise<boolean> {
    const trimmedName =
        name.trim();

    if (!trimmedName) {
        throw new ExpectedError(
            "Palette name is required."
        );
    }

    const result =
        await query(
            `
            UPDATE "SavedPalette" sp
            SET
                name = $3,
                "updatedAt" = NOW()
            FROM "User" u
            WHERE
                sp.id = $1
                AND sp."userId" = u.id
                AND u."discordId" = $2
            RETURNING sp.id
            `,
            [
                paletteId,
                discordId,
                trimmedName,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function deleteSavedPalette(
    paletteId: string,
    discordId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "SavedPalette" sp
            USING "User" u
            WHERE
                sp.id = $1
                AND sp."userId" = u.id
                AND u."discordId" = $2
            RETURNING sp.id
            `,
            [
                paletteId,
                discordId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function getSavedPaletteByIdForDiscordUser(
    paletteId: string,
    discordId: string
): Promise<SavedPalette | null> {
    const result =
        await query<SavedPalette>(
            `
            SELECT
                sp.id,
                sp.name,
                sp."aestheticId",
                sp."moodId",
                sp.colors,
                sp."createdAt",
                sp."updatedAt"
            FROM "SavedPalette" sp
            INNER JOIN "User" u
                ON u.id = sp."userId"
            WHERE
                sp.id = $1
                AND u."discordId" = $2
            LIMIT 1
            `,
            [
                paletteId,
                discordId,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}