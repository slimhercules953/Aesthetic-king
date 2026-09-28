import {
    query,
} from "./database";

export type StudioUser = {
    id: string;
    discordId: string;
    username: string | null;
    displayName: string | null;
    avatarHash: string | null;
};

type DiscordUserInput = {
    discordId: string;
    username: string;
    displayName: string | null;
    avatarHash: string | null;
};

export async function upsertDiscordUser(
    input: DiscordUserInput
): Promise<StudioUser> {
    const existing =
        await query<StudioUser>(
            `
            SELECT
                id,
                "discordId",
                username,
                "displayName",
                "avatarHash"
            FROM "User"
            WHERE "discordId" = $1
            LIMIT 1
            `,
            [
                input.discordId,
            ]
        );

    if (
        existing.rows.length >
        0
    ) {
        const updated =
            await query<StudioUser>(
                `
                UPDATE "User"
                SET
                    username = $2,
                    "displayName" = $3,
                    "avatarHash" = $4,
                    "updatedAt" = NOW()
                WHERE "discordId" = $1
                RETURNING
                    id,
                    "discordId",
                    username,
                    "displayName",
                    "avatarHash"
                `,
                [
                    input.discordId,
                    input.username,
                    input.displayName,
                    input.avatarHash,
                ]
            );

        return updated.rows[0];
    }

    const id =
        crypto.randomUUID();

    const created =
        await query<StudioUser>(
            `
            INSERT INTO "User" (
                id,
                "discordId",
                username,
                "displayName",
                "avatarHash",
                "createdAt",
                "updatedAt"
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                NOW(),
                NOW()
            )
            RETURNING
                id,
                "discordId",
                username,
                "displayName",
                "avatarHash"
            `,
            [
                id,
                input.discordId,
                input.username,
                input.displayName,
                input.avatarHash,
            ]
        );

    return created.rows[0];
}