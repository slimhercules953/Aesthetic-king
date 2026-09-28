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
    const payload:
        SessionPayload = {
        ...user,

        expiresAt:
            Math.floor(
                Date.now() / 1000
            ) +
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

        return payload;
    } catch {
        return null;
    }
}