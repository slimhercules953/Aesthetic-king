import {
    query,
} from "./database";

export type Collection = {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type CollectionItem = {
    id: string;
    collectionId: string;
    itemType:
    | "AESTHETIC"
    | "PALETTE"
    | "ASSET";
    itemId: string;
    createdAt: Date;
};

export async function getCollectionsByDiscordId(
    discordId: string
): Promise<Collection[]> {
    const result =
        await query<Collection>(
            `
            SELECT
                c.id,
                c.name,
                c.description,
                c."createdAt",
                c."updatedAt"
            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                u."discordId" = $1
            ORDER BY
                c."updatedAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}

export async function getCollectionByIdForDiscordUser(
    collectionId: string,
    discordId: string
): Promise<Collection | null> {
    const result =
        await query<Collection>(
            `
            SELECT
                c.id,
                c.name,
                c.description,
                c."createdAt",
                c."updatedAt"
            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                c.id = $1
                AND u."discordId" = $2
            LIMIT 1
            `,
            [
                collectionId,
                discordId,
            ]
        );

    return (
        result.rows[0] ??
        null
    );
}

export async function createCollection(
    discordId: string,
    name: string,
    description: string | null = null
): Promise<Collection> {
    const trimmedName =
        name.trim();

    if (!trimmedName) {
        throw new Error(
            "Collection name is required."
        );
    }

    const result =
        await query<Collection>(
            `
            INSERT INTO "Collection" (
                id,
                "userId",
                name,
                description,
                "createdAt",
                "updatedAt"
            )
            SELECT
                gen_random_uuid()::text,
                u.id,
                $2,
                $3,
                NOW(),
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1
            RETURNING
                id,
                name,
                description,
                "createdAt",
                "updatedAt"
            `,
            [
                discordId,
                trimmedName,
                description?.trim() ||
                null,
            ]
        );

    const collection =
        result.rows[0];

    if (!collection) {
        throw new Error(
            "Unable to create collection."
        );
    }

    return collection;
}

export async function renameCollection(
    collectionId: string,
    discordId: string,
    name: string
): Promise<boolean> {
    const trimmedName =
        name.trim();

    if (!trimmedName) {
        throw new Error(
            "Collection name is required."
        );
    }

    const result =
        await query(
            `
            UPDATE "Collection" c
            SET
                name = $3,
                "updatedAt" = NOW()
            FROM "User" u
            WHERE
                c.id = $1
                AND c."userId" = u.id
                AND u."discordId" = $2
            RETURNING c.id
            `,
            [
                collectionId,
                discordId,
                trimmedName,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function deleteCollection(
    collectionId: string,
    discordId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "Collection" c
            USING "User" u
            WHERE
                c.id = $1
                AND c."userId" = u.id
                AND u."discordId" = $2
            RETURNING c.id
            `,
            [
                collectionId,
                discordId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function getCollectionItems(
    collectionId: string,
    discordId: string
): Promise<CollectionItem[]> {
    const result =
        await query<CollectionItem>(
            `
            SELECT
                ci.id,
                ci."collectionId",
                ci."itemType",
                ci."itemId",
                ci."createdAt"
            FROM "CollectionItem" ci
            INNER JOIN "Collection" c
                ON c.id = ci."collectionId"
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                ci."collectionId" = $1
                AND u."discordId" = $2
            ORDER BY
                ci."createdAt" DESC
            `,
            [
                collectionId,
                discordId,
            ]
        );

    return result.rows;
}

export async function addAssetToCollection(
    collectionId: string,
    discordId: string,
    setId: string
): Promise<boolean> {
    const result =
        await query(
            `
            INSERT INTO "CollectionItem" (
                id,
                "collectionId",
                "itemType",
                "itemId",
                "createdAt"
            )
            SELECT
                gen_random_uuid()::text,
                c.id,
                'ASSET',
                $3,
                NOW()
            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                c.id = $1
                AND u."discordId" = $2
            ON CONFLICT (
                "collectionId",
                "itemType",
                "itemId"
            )
            DO NOTHING
            RETURNING id
            `,
            [
                collectionId,
                discordId,
                setId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function removeAssetFromCollection(
    collectionId: string,
    discordId: string,
    setId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "CollectionItem" ci
            USING "Collection" c,
                  "User" u
            WHERE
                ci."collectionId" = c.id
                AND c."userId" = u.id
                AND ci."collectionId" = $1
                AND u."discordId" = $2
                AND ci."itemType" = 'ASSET'
                AND ci."itemId" = $3
            RETURNING ci.id
            `,
            [
                collectionId,
                discordId,
                setId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}
export type CollectionAssetMembership =
    Collection & {
        containsAsset: boolean;
    };

export async function getCollectionsForAsset(
    discordId: string,
    setId: string
): Promise<CollectionAssetMembership[]> {
    const result =
        await query<CollectionAssetMembership>(
            `
            SELECT
                c.id,
                c.name,
                c.description,
                c."createdAt",
                c."updatedAt",

                EXISTS (
                    SELECT 1
                    FROM "CollectionItem" ci
                    WHERE
                        ci."collectionId" = c.id
                        AND ci."itemType" = 'ASSET'
                        AND ci."itemId" = $2
                ) AS "containsAsset"

            FROM "Collection" c

            INNER JOIN "User" u
                ON u.id = c."userId"

            WHERE
                u."discordId" = $1

            ORDER BY
                c."updatedAt" DESC
            `,
            [
                discordId,
                setId,
            ]
        );

    return result.rows;
}
export type CollectionPaletteMembership =
    Collection & {
        containsPalette: boolean;
    };

export async function getCollectionsForPalette(
    discordId: string,
    paletteId: string
): Promise<CollectionPaletteMembership[]> {
    const result =
        await query<CollectionPaletteMembership>(
            `
            SELECT
                c.id,
                c.name,
                c.description,
                c."createdAt",
                c."updatedAt",

                EXISTS (
                    SELECT 1
                    FROM "CollectionItem" ci
                    WHERE
                        ci."collectionId" = c.id
                        AND ci."itemType" = 'PALETTE'
                        AND ci."itemId" = $2
                ) AS "containsPalette"

            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"

            WHERE
                u."discordId" = $1

            ORDER BY
                c."updatedAt" DESC
            `,
            [
                discordId,
                paletteId,
            ]
        );

    return result.rows;
}

export async function addPaletteToCollection(
    collectionId: string,
    discordId: string,
    paletteId: string
): Promise<boolean> {
    const result =
        await query(
            `
            INSERT INTO "CollectionItem" (
                id,
                "collectionId",
                "itemType",
                "itemId",
                "createdAt"
            )
            SELECT
                gen_random_uuid()::text,
                c.id,
                'PALETTE',
                $3,
                NOW()
            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                c.id = $1
                AND u."discordId" = $2
            ON CONFLICT (
                "collectionId",
                "itemType",
                "itemId"
            )
            DO NOTHING
            RETURNING id
            `,
            [
                collectionId,
                discordId,
                paletteId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function removePaletteFromCollection(
    collectionId: string,
    discordId: string,
    paletteId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "CollectionItem" ci
            USING "Collection" c,
                  "User" u
            WHERE
                ci."collectionId" = c.id
                AND c."userId" = u.id
                AND ci."collectionId" = $1
                AND u."discordId" = $2
                AND ci."itemType" = 'PALETTE'
                AND ci."itemId" = $3
            RETURNING ci.id
            `,
            [
                collectionId,
                discordId,
                paletteId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}
export type CollectionAestheticMembership =
    Collection & {
        containsAesthetic: boolean;
    };

export async function getCollectionsForAesthetic(
    discordId: string,
    aestheticId: string
): Promise<CollectionAestheticMembership[]> {
    const result =
        await query<CollectionAestheticMembership>(
            `
            SELECT
                c.id,
                c.name,
                c.description,
                c."createdAt",
                c."updatedAt",

                EXISTS (
                    SELECT 1
                    FROM "CollectionItem" ci
                    WHERE
                        ci."collectionId" = c.id
                        AND ci."itemType" = 'AESTHETIC'
                        AND ci."itemId" = $2
                ) AS "containsAesthetic"

            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"

            WHERE
                u."discordId" = $1

            ORDER BY
                c."updatedAt" DESC
            `,
            [
                discordId,
                aestheticId,
            ]
        );

    return result.rows;
}

export async function addAestheticToCollection(
    collectionId: string,
    discordId: string,
    aestheticId: string
): Promise<boolean> {
    const result =
        await query(
            `
            INSERT INTO "CollectionItem" (
                id,
                "collectionId",
                "itemType",
                "itemId",
                "createdAt"
            )
            SELECT
                gen_random_uuid()::text,
                c.id,
                'AESTHETIC',
                $3,
                NOW()
            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                c.id = $1
                AND u."discordId" = $2
            ON CONFLICT (
                "collectionId",
                "itemType",
                "itemId"
            )
            DO NOTHING
            RETURNING id
            `,
            [
                collectionId,
                discordId,
                aestheticId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

export async function removeAestheticFromCollection(
    collectionId: string,
    discordId: string,
    aestheticId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "CollectionItem" ci
            USING "Collection" c,
                  "User" u
            WHERE
                ci."collectionId" = c.id
                AND c."userId" = u.id
                AND ci."collectionId" = $1
                AND u."discordId" = $2
                AND ci."itemType" = 'AESTHETIC'
                AND ci."itemId" = $3
            RETURNING ci.id
            `,
            [
                collectionId,
                discordId,
                aestheticId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}