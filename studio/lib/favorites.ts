import {
    query,
} from "./database";

export type FavoriteAsset = {
    id: string;
    assetType:
        | "PFP"
        | "BANNER";
    assetKey: string;
    setId: string | null;
    createdAt: Date;
};

export async function getFavoriteAssetsByDiscordId(
    discordId: string
): Promise<FavoriteAsset[]> {
    const result =
        await query<FavoriteAsset>(
            `
            SELECT
                fa.id,
                fa."assetType",
                fa."assetKey",
                fa."setId",
                fa."createdAt"
            FROM "FavoriteAsset" fa
            INNER JOIN "User" u
                ON u.id = fa."userId"
            WHERE
                u."discordId" = $1
            ORDER BY
                fa."createdAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}

export async function isAssetSetFavorited(
    discordId: string,
    setId: string
): Promise<boolean> {
    const result =
        await query<{
            exists: boolean;
        }>(
            `
            SELECT EXISTS (
                SELECT 1
                FROM "FavoriteAsset" fa
                INNER JOIN "User" u
                    ON u.id = fa."userId"
                WHERE
                    u."discordId" = $1
                    AND fa."setId" = $2
            ) AS "exists"
            `,
            [
                discordId,
                setId,
            ]
        );

    return Boolean(
        result.rows[0]
            ?.exists
    );
}

export async function addFavoriteAssetSet(
    discordId: string,
    setId: string,
    assetKey: string
): Promise<FavoriteAsset | null> {
    const result =
        await query<FavoriteAsset>(
            `
            INSERT INTO "FavoriteAsset" (
                id,
                "userId",
                "assetType",
                "assetKey",
                "setId",
                "createdAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                'BANNER',
                $3,
                $2,
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1
            ON CONFLICT (
                "userId",
                "assetKey"
            )
            DO NOTHING
            RETURNING
                id,
                "assetType",
                "assetKey",
                "setId",
                "createdAt"
            `,
            [
                discordId,
                setId,
                assetKey,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

export async function removeFavoriteAssetSet(
    discordId: string,
    setId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "FavoriteAsset" fa
            USING "User" u
            WHERE
                fa."userId" = u.id
                AND u."discordId" = $1
                AND fa."setId" = $2
            RETURNING fa.id
            `,
            [
                discordId,
                setId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}