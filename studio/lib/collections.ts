import {
    ExpectedError,
} from "./apiError";

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
        throw new ExpectedError(
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
        throw new ExpectedError(
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
        throw new ExpectedError(
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

/**
 * Item counts for every collection a user owns, in one query.
 *
 * The collections list page used to call `getCollectionItems` once per
 * collection just to read `.length`, which is one query per card and
 * fetches every row of every collection to count them in JavaScript.
 * Collections are capped per plan, so the old version was never
 * catastrophic — but it made the page's cost grow with how much the
 * user had saved, which is the wrong direction.
 *
 * Collections with no items are absent from the result rather than
 * returned as zero, so callers default with `?? 0`.
 */
export async function getCollectionItemCountByDiscordId(
    discordId: string
): Promise<Map<string, number>> {
    const result =
        await query<{ collectionId: string; count: string }>(
            `
            SELECT
                c.id AS "collectionId",
                COUNT(ci.id)::text AS count
            FROM "Collection" c
            INNER JOIN "User" u
                ON u.id = c."userId"
            LEFT JOIN "CollectionItem" ci
                ON ci."collectionId" = c.id
            WHERE
                u."discordId" = $1
            GROUP BY
                c.id
            `,
            [
                discordId,
            ]
        );

    return new Map(
        result.rows.map(
            (row) => [
                row.collectionId,
                Number(row.count),
            ]
        )
    );
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

/**
 * Collection membership for many palettes at once.
 *
 * `getCollectionsForPalette` answers "which of my collections hold this
 * palette?" for one palette, so the palette grid called it once per
 * palette to badge each card — a user with 40 palettes issued 40
 * queries that each scanned every one of their collections.
 *
 * This issues two queries regardless of how many palettes are passed:
 * one for the collections, one for the relevant membership rows. The
 * result is keyed by palette id and every palette is present, even when
 * it belongs to no collection, so a card can render its badges without
 * a lookup miss.
 */
export async function getCollectionsForPalettes(
    discordId: string,
    paletteIds: string[]
): Promise<Map<string, CollectionPaletteMembership[]>> {
    const collections =
        await getCollectionsByDiscordId(
            discordId
        );

    const memberships = new Map(
        paletteIds.map(
            (paletteId) => [
                paletteId,
                collections.map(
                    (collection) => ({
                        ...collection,
                        containsPalette: false,
                    })
                ),
            ]
        )
    );

    if (paletteIds.length === 0) {
        return memberships;
    }

    const contained =
        await query<{
            collectionId: string;
            itemId: string;
        }>(
            `
            SELECT
                ci."collectionId",
                ci."itemId"
            FROM "CollectionItem" ci
            INNER JOIN "Collection" c
                ON c.id = ci."collectionId"
            INNER JOIN "User" u
                ON u.id = c."userId"
            WHERE
                u."discordId" = $1
                AND ci."itemType" = 'PALETTE'
                AND ci."itemId" = ANY($2::text[])
            `,
            [
                discordId,
                paletteIds,
            ]
        );

    const containedPairs = new Set(
        contained.rows.map(
            (row) =>
                `${row.collectionId}\u0000${row.itemId}`
        )
    );

    for (const [paletteId, entries] of memberships) {
        for (const entry of entries) {
            entry.containsPalette =
                containedPairs.has(
                    `${entry.id}\u0000${paletteId}`
                );
        }
    }

    return memberships;
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