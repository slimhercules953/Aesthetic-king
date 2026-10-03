function getEncryptionKey() {
    const encodedKey =
        process.env.OAUTH_TOKEN_ENCRYPTION_KEY;

    if (!encodedKey) {
        throw new Error(
            "OAUTH_TOKEN_ENCRYPTION_KEY is not configured."
        );
    }

    const rawKey =
        Uint8Array.from(
            atob(encodedKey),
            (character) =>
                character.charCodeAt(0)
        );

    if (rawKey.length !== 32) {
        throw new Error(
            "OAUTH_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes."
        );
    }

    return crypto.subtle.importKey(
        "raw",
        rawKey,
        {
            name: "AES-GCM",
        },
        false,
        [
            "encrypt",
            "decrypt",
        ]
    );
}

function bytesToBase64(
    value: Uint8Array
) {
    let binary = "";

    for (const byte of value) {
        binary +=
            String.fromCharCode(
                byte
            );
    }

    return btoa(binary);
}

function base64ToBytes(
    value: string
) {
    const binary =
        atob(value);

    return Uint8Array.from(
        binary,
        (character) =>
            character.charCodeAt(0)
    );
}

export async function encryptToken(
    plaintext: string
) {
    if (!plaintext) {
        throw new Error(
            "Cannot encrypt an empty token."
        );
    }

    const key =
        await getEncryptionKey();

    const iv =
        crypto.getRandomValues(
            new Uint8Array(12)
        );

    const encoded =
        new TextEncoder().encode(
            plaintext
        );

    const encrypted =
        await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv,
            },
            key,
            encoded
        );

    return [
        "v1",
        bytesToBase64(iv),
        bytesToBase64(
            new Uint8Array(
                encrypted
            )
        ),
    ].join(".");
}

export async function decryptToken(
    ciphertext: string
) {
    const [
        version,
        encodedIv,
        encodedCiphertext,
    ] = ciphertext.split(".");

    if (
        version !== "v1" ||
        !encodedIv ||
        !encodedCiphertext
    ) {
        throw new Error(
            "Invalid encrypted token format."
        );
    }

    const key =
        await getEncryptionKey();

    const iv =
        base64ToBytes(
            encodedIv
        );

    const encrypted =
        base64ToBytes(
            encodedCiphertext
        );

    const decrypted =
        await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv,
            },
            key,
            encrypted
        );

    return new TextDecoder().decode(
        decrypted
    );
}