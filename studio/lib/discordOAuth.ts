import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

import {
    decryptToken,
    encryptToken,
} from "./tokenEncryption";

import {
    refreshDiscordAccessToken,
} from "./auth";

type DiscordOAuthCredentialRow = {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    scope: string;
    expiresAt: Date;
};

export type DiscordOAuthTokens = {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    scope: string;
    expiresAt: Date;
};

export async function saveDiscordOAuthCredentials(
    discordId: string,
    input: {
        accessToken: string;
        refreshToken: string;
        tokenType: string;
        scope: string;
        expiresIn: number;
    }
) {
    const [
        encryptedAccessToken,
        encryptedRefreshToken,
    ] =
        await Promise.all([
            encryptToken(
                input.accessToken
            ),

            encryptToken(
                input.refreshToken
            ),
        ]);

    const expiresAt =
        new Date(
            Date.now() +
                input.expiresIn *
                    1000
        );

    const result =
        await query(
            `
            INSERT INTO "DiscordOAuthCredential" (
                id,
                "userId",
                "accessToken",
                "refreshToken",
                "tokenType",
                scope,
                "expiresAt",
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
                $6,
                NOW(),
                NOW()
            FROM "User" u
            WHERE
                u."discordId" = $1

            ON CONFLICT ("userId")
            DO UPDATE SET
                "accessToken" =
                    EXCLUDED."accessToken",

                "refreshToken" =
                    EXCLUDED."refreshToken",

                "tokenType" =
                    EXCLUDED."tokenType",

                scope =
                    EXCLUDED.scope,

                "expiresAt" =
                    EXCLUDED."expiresAt",

                "updatedAt" =
                    NOW()

            RETURNING id
            `,
            [
                discordId,
                encryptedAccessToken,
                encryptedRefreshToken,
                input.tokenType,
                input.scope,
                expiresAt,
            ]
        );

    if (
        (result.rowCount ?? 0) ===
        0
    ) {
        throw new ExpectedError(
            "Unable to store Discord OAuth credentials."
        );
    }
}

export async function getDiscordOAuthCredentials(
    discordId: string
): Promise<DiscordOAuthTokens | null> {
    const result =
        await query<DiscordOAuthCredentialRow>(
            `
            SELECT
                o."accessToken",
                o."refreshToken",
                o."tokenType",
                o.scope,
                o."expiresAt"

            FROM "DiscordOAuthCredential" o

            INNER JOIN "User" u
                ON u.id = o."userId"

            WHERE
                u."discordId" = $1

            LIMIT 1
            `,
            [
                discordId,
            ]
        );

    const credentials =
        result.rows[0];

    if (!credentials) {
        return null;
    }

    const [
        accessToken,
        refreshToken,
    ] =
        await Promise.all([
            decryptToken(
                credentials.accessToken
            ),

            decryptToken(
                credentials.refreshToken
            ),
        ]);

    return {
        accessToken,
        refreshToken,
        tokenType:
            credentials.tokenType,

        scope:
            credentials.scope,

        expiresAt:
            credentials.expiresAt,
    };
}

export async function getValidDiscordAccessToken(
    discordId: string
): Promise<string | null> {
    const credentials =
        await getDiscordOAuthCredentials(
            discordId
        );

    if (!credentials) {
        return null;
    }

    const refreshBufferMs =
        60 * 1000;

    const expiresSoon =
        credentials.expiresAt.getTime() <=
        Date.now() +
            refreshBufferMs;

    if (!expiresSoon) {
        return credentials.accessToken;
    }

    const refreshed =
        await refreshDiscordAccessToken(
            credentials.refreshToken
        );

    await saveDiscordOAuthCredentials(
        discordId,
        {
            accessToken:
                refreshed.access_token,

            refreshToken:
                refreshed.refresh_token,

            tokenType:
                refreshed.token_type,

            scope:
                refreshed.scope,

            expiresIn:
                refreshed.expires_in,
        }
    );

    return refreshed.access_token;
}