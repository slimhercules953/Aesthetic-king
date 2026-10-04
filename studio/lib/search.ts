import {
    query,
} from "./database";

import {
    getAssetSets,
} from "./assetCatalog";

/**
 * One search box in the topbar, one endpoint behind it.
 *
 * Scope is deliberately "things this account has saved" plus the public
 * asset catalog. Searching the whole feed would surface other people's
 * content in a box that reads like a private finder, and servers are not
 * included because their names only exist on Discord — resolving them
 * would mean an OAuth round trip on every keystroke.
 *
 * Every branch is a parameterised `ILIKE` on a small, indexed-by-user set,
 * so the whole thing stays cheap. Results are capped per group so one
 * hoarder of palettes cannot crowd out their aesthetics.
 */

export type SearchGroup =
    | "aesthetic"
    | "palette"
    | "profile"
    | "collection"
    | "assetSet";

export type SearchHit = {
    group: SearchGroup;
    id: string;
    title: string;
    subtitle: string | null;
    href: string;
};

const PER_GROUP = 5;

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function titleCase(value: string): string {
    return value
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export async function searchStudio(
    discordId: string,
    rawTerm: string
): Promise<SearchHit[]> {
    const term = rawTerm.trim().slice(0, 64);
    if (term.length < 2) return [];

    const pattern = `%${escapeLike(term)}%`;

    const [aesthetics, palettes, profiles, collections] =
        await Promise.all([
            query<{ id: string; name: string; "aestheticId": string }>(
                `
                SELECT a."id", a."name", a."aestheticId"
                FROM "SavedAesthetic" a
                INNER JOIN "User" u ON u.id = a."userId"
                WHERE u."discordId" = $1 AND a."name" ILIKE $2
                ORDER BY a."updatedAt" DESC
                LIMIT ${PER_GROUP}
                `,
                [discordId, pattern]
            ),

            query<{ id: string; name: string | null; "colors": string[] }>(
                `
                SELECT p."id", p."name", p."colors"
                FROM "SavedPalette" p
                INNER JOIN "User" u ON u.id = p."userId"
                WHERE u."discordId" = $1
                  AND (p."name" ILIKE $2 OR EXISTS (
                      SELECT 1 FROM unnest(p."colors") AS c WHERE c ILIKE $2
                  ))
                ORDER BY p."updatedAt" DESC
                LIMIT ${PER_GROUP}
                `,
                [discordId, pattern]
            ),

            query<{ id: string; name: string }>(
                `
                SELECT pr."id", pr."name"
                FROM "Profile" pr
                INNER JOIN "User" u ON u.id = pr."userId"
                WHERE u."discordId" = $1 AND pr."name" ILIKE $2
                ORDER BY pr."updatedAt" DESC
                LIMIT ${PER_GROUP}
                `,
                [discordId, pattern]
            ),

            query<{ id: string; name: string; description: string | null }>(
                `
                SELECT c."id", c."name", c."description"
                FROM "Collection" c
                INNER JOIN "User" u ON u.id = c."userId"
                WHERE
                    u."discordId" = $1
                    AND (
                        c."name" ILIKE $2
                        OR COALESCE(c."description", '') ILIKE $2
                    )
                ORDER BY c."updatedAt" DESC
                LIMIT ${PER_GROUP}
                `,
                [discordId, pattern]
            ),
        ]);

    const hits: SearchHit[] = [
        ...aesthetics.rows.map((row) => ({
            group: "aesthetic" as const,
            id: row.id,
            title: row.name,
            subtitle: titleCase(row.aestheticId),
            href: `/dashboard/aesthetics/${row.id}`,
        })),

        ...palettes.rows.map((row) => ({
            group: "palette" as const,
            id: row.id,
            title: row.name?.trim() || "Untitled palette",
            subtitle: `${row.colors.length} colors`,
            href: `/dashboard/palettes`,
        })),

        ...profiles.rows.map((row) => ({
            group: "profile" as const,
            id: row.id,
            title: row.name,
            subtitle: "Profile",
            href: `/dashboard/profile/${row.id}`,
        })),

        ...collections.rows.map((row) => ({
            group: "collection" as const,
            id: row.id,
            title: row.name,
            subtitle: row.description?.trim() || null,
            href: `/dashboard/collections/${row.id}`,
        })),
    ];

    hits.push(...searchAssetSets(term));

    return hits;
}

/**
 * The asset catalog is a bundled JSON file, not a table, so it is filtered
 * in-process. Sets have no name — only numeric ids and facet tags — so a
 * match on either is what a user would expect from typing "cozy".
 */
function searchAssetSets(term: string): SearchHit[] {
    const needle = term.toLowerCase();

    return getAssetSets()
        .filter((set) => {
            if (set.id.toLowerCase().includes(needle)) return true;

            return [...set.aesthetics, ...set.moods, ...(set.tags ?? [])]
                .some((value) => value.toLowerCase().includes(needle));
        })
        .slice(0, PER_GROUP)
        .map((set) => ({
            group: "assetSet" as const,
            id: set.id,
            title: `Profile Set ${set.id}`,
            subtitle:
                set.aesthetics.slice(0, 3).map(titleCase).join(" · ") ||
                null,
            href: `/dashboard/assets/${set.id}`,
        }));
}
