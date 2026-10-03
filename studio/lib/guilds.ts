import {
    query,
} from "./database";

type GuildRow = {
    discordId: string;
};

export async function getInstalledGuildIds(): Promise<
    Set<string>
> {
    const result =
        await query<GuildRow>(
            `
                SELECT "discordId"
                FROM "Guild"
            `
        );

    return new Set(
        result.rows.map(
            (guild) =>
                guild.discordId
        )
    );
}

export async function isGuildInstalled(
    discordId: string
): Promise<boolean> {
    if (!discordId) {
        return false;
    }

    const result =
        await query<GuildRow>(
            `
                SELECT "discordId"
                FROM "Guild"
                WHERE "discordId" = $1
                LIMIT 1
            `,
            [discordId]
        );

    return (
        result.rows.length >
        0
    );
}