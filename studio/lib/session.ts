import {
    query,
} from "./database";

export const SESSION_COOKIE_NAME =
    "aesthetic_king_session";

export const SESSION_DURATION_SECONDS =
    60 * 60 * 24 * 7;

export type SessionUser = {
    discordId: string;
    username: string;
    avatarHash: string | null;
};

type SessionPayload =
    SessionUser & {
        expiresAt: number;

        /**
         * The user's session epoch at the moment this token was minted.
         *
         * Logout bumps the stored epoch, so any token carrying an older
         * value is dead even though its signature still verifies.
         *
         * An integer counter rather than a timestamp because comparing an
         * app-generated `issuedAt` against the database's `now()` would
         * let clock skew between the two hosts either revoke a brand-new
         * token or leave a stolen one alive.
         *
         * Optional because tokens issued before revocation existed carry
         * no epoch; those are treated as epoch 0.
         */
        sessionEpoch?: number;
    };

function getSessionSecret() {
    const secret =
        process.env.SESSION_SECRET;

    if (!secret) {
        throw new Error(
            "SESSION_SECRET is not configured."
        );
    }

    return secret;
}

function base64UrlEncode(
    value: Uint8Array
) {
    let binary = "";

    for (const byte of value) {
        binary +=
            String.fromCharCode(
                byte
            );
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function base64UrlDecode(
    value: string
) {
    const normalized =
        value
            .replace(/-/g, "+")
            .replace(/_/g, "/");

    const padded =
        normalized.padEnd(
            Math.ceil(
                normalized.length /
                    4
            ) * 4,
            "="
        );

    const binary =
        atob(padded);

    return Uint8Array.from(
        binary,
        (character) =>
            character.charCodeAt(0)
    );
}

async function getSigningKey() {
    const encoder =
        new TextEncoder();

    return crypto.subtle.importKey(
        "raw",
        encoder.encode(
            getSessionSecret()
        ),
        {
            name: "HMAC",
            hash: "SHA-256",
        },
        false,
        [
            "sign",
            "verify",
        ]
    );
}

export async function createSessionToken(
    user: SessionUser
) {
    const nowSeconds =
        Math.floor(
            Date.now() / 1000
        );

    /*
     * Stamp the token with the user's current epoch so it survives until
     * the next logout. If the epoch cannot be read the token is minted at
     * 0: refusing to sign anybody in over a transient database blip is
     * the worse failure, and a token minted during an outage is still
     * checked against the stored epoch on every later request.
     */
    const sessionEpoch =
        (await getSessionEpoch(user.discordId)) ?? 0;

    const payload:
        SessionPayload = {
        ...user,

        sessionEpoch,

        expiresAt:
            nowSeconds +
            SESSION_DURATION_SECONDS,
    };

    const encoder =
        new TextEncoder();

    const payloadBytes =
        encoder.encode(
            JSON.stringify(
                payload
            )
        );

    const encodedPayload =
        base64UrlEncode(
            payloadBytes
        );

    const key =
        await getSigningKey();

    const signature =
        await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(
                encodedPayload
            )
        );

    return (
        `${encodedPayload}.` +
        base64UrlEncode(
            new Uint8Array(
                signature
            )
        )
    );
}

/**
 * The user's current session epoch, or 0 when they have never logged out.
 *
 * Returns `undefined` when the lookup could not be performed, which lets
 * the caller decide what a database outage means rather than having the
 * two cases collapse into one.
 */
async function getSessionEpoch(
    discordId: string
): Promise<number | undefined> {
    try {
        const result =
            await query<{
                sessionEpoch: number | null;
            }>(
                `SELECT "sessionEpoch"
                   FROM "User"
                  WHERE "discordId" = $1
                  LIMIT 1`,
                [discordId]
            );

        if (result.rowCount === 0) {
            // No user row: nothing has ever been revoked for this id.
            return 0;
        }

        const raw =
            result.rows[0].sessionEpoch;

        // `pg` hands back BIGINT as a string to stay safe past
        // Number.MAX_SAFE_INTEGER.
        const epoch =
            raw === null || raw === undefined
                ? 0
                : Number(raw);

        return Number.isFinite(epoch) ? epoch : 0;
    } catch {
        return undefined;
    }
}

/**
 * Marks every session token minted so far as dead.
 *
 * Called on logout. Bumping a counter rather than deleting a token record
 * is what makes this safe to call from a request carrying a forged or
 * already-expired cookie: it needs nothing from the token beyond the
 * identity inside it, and it can only ever reduce access.
 *
 * A plain UPDATE is enough — a token can only exist for a `discordId`
 * that completed OAuth, and that always writes the user row. Zero rows
 * therefore means there was never a session to revoke.
 */
export async function revokeSessions(
    discordId: string
): Promise<void> {
    await query(
        `UPDATE "User"
            SET "sessionEpoch" =
                    COALESCE("sessionEpoch", 0) + 1,
                "updatedAt" = NOW()
          WHERE "discordId" = $1`,
        [discordId]
    );
}

export async function verifySessionToken(
    token: string
): Promise<SessionPayload | null> {
    try {
        const [
            encodedPayload,
            encodedSignature,
        ] = token.split(".");

        if (
            !encodedPayload ||
            !encodedSignature
        ) {
            return null;
        }

        const encoder =
            new TextEncoder();

        const key =
            await getSigningKey();

        const valid =
            await crypto.subtle.verify(
                "HMAC",
                key,
                base64UrlDecode(
                    encodedSignature
                ),
                encoder.encode(
                    encodedPayload
                )
            );

        if (!valid) {
            return null;
        }

        const payloadJson =
            new TextDecoder().decode(
                base64UrlDecode(
                    encodedPayload
                )
            );

        const payload =
            JSON.parse(
                payloadJson
            ) as SessionPayload;

        if (
            !payload.discordId ||
            !payload.username ||
            !payload.expiresAt
        ) {
            return null;
        }

        const now =
            Math.floor(
                Date.now() / 1000
            );

        if (
            payload.expiresAt <= now
        ) {
            return null;
        }

        /*
         * Reject tokens the user has logged out of.
         *
         * The signature and expiry above only prove the token is genuine
         * and in date; without this check a copied cookie would stay
         * usable for the rest of the 7-day lifetime no matter how many
         * times the user pressed logout.
         *
         * Fail closed. A revocation state that cannot be read is
         * indistinguishable from a revoked one, and the cost of a
         * spurious sign-out is one round through Discord OAuth, while the
         * cost of honouring a revoked token is continued account access.
         */
        const currentEpoch =
            await getSessionEpoch(
                payload.discordId
            );

        if (currentEpoch === undefined) {
            return null;
        }

        const tokenEpoch =
            Number.isFinite(payload.sessionEpoch)
                ? Number(payload.sessionEpoch)
                : 0;

        if (tokenEpoch < currentEpoch) {
            return null;
        }

        return payload;
    } catch {
        return null;
    }
}