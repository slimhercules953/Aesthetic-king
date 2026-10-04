require("dotenv").config();

const requiredVariables = [
    "TOKEN",
    "CLIENT_ID",
    "DEV_GUILD_ID",
];

const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
);

if (missingVariables.length > 0) {
    throw new Error(
        `Missing required environment variables: ${missingVariables.join(", ")}`
    );
}

/*
 * `STUDIO_URL` is handy to point at a dev server while testing, but the
 * link ends up inside embeds that other people read, and
 * `http://10.40.10.47:3000` is both useless to them and a leak of the
 * local network layout. A machine address is therefore treated as unset,
 * and the embeds fall back to naming the page, which is always true.
 */
const LOOPBACK_HOSTS = new Set([
    "localhost",
    "localhost.localdomain",
    "0.0.0.0",
    "::",
    "::1",
]);

function isMachineAddress(hostname) {
    const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();

    if (LOOPBACK_HOSTS.has(host)) {
        return true;
    }

    /*
     * 127.0.0.1, 10.x, 172.16-31.x, 192.168.x, 169.254.x and the IPv6
     * unique-local range. Anything else that is still a bare IP is a
     * host nobody off the network can name either, so it is rejected
     * too rather than guessed at.
     */
    if (/^[0-9.]+$/.test(host)) {
        return (
            /^127\./.test(host) ||
            /^10\./.test(host) ||
            /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^169\.254\./.test(host) ||
            !/^(\d{1,3}\.){3}\d{1,3}$/.test(host)
        );
    }

    return /^f[cd][0-9a-f]{2}:/i.test(host);
}

function resolveStudioUrl(raw, variableName = "STUDIO_URL") {
    if (!raw) {
        return "";
    }

    let parsed;

    try {
        parsed = new URL(raw);
    } catch {
        console.warn(
            `[config] ${variableName} "${raw}" is not a valid URL; ` +
            "Studio links will name the page instead of linking to it."
        );
        return "";
    }

    if (!/^https?:$/.test(parsed.protocol)) {
        console.warn(
            `[config] ${variableName} "${raw}" must be http(s); ` +
            "Studio links will name the page instead of linking to it."
        );
        return "";
    }

    const allowPrivate =
        String(process.env.STUDIO_URL_ALLOW_PRIVATE || "").toLowerCase() ===
        "true";

    if (isMachineAddress(parsed.hostname) && !allowPrivate) {
        console.warn(
            `[config] ${variableName} "${raw}" points at this machine, which ` +
            "other Discord users cannot open. Set it to the public Studio " +
            "domain to get clickable links; until then embeds name the page. " +
            "Set STUDIO_URL_ALLOW_PRIVATE=true to keep the local link while " +
            "testing."
        );
        return "";
    }

    return raw.replace(/\/+$/, "");
}

const config = {
    environment: process.env.NODE_ENV || "development",

    discord: {
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        devGuildId: process.env.DEV_GUILD_ID,
    },

    r2: {
        accountId: process.env.R2_ACCOUNT_ID || null,
        accessKeyId: process.env.R2_ACCESS_KEY_ID || null,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || null,
        bucketName: process.env.R2_BUCKET_NAME || null,
        publicUrl: process.env.R2_PUBLIC_URL || null,

        // The account ID is embedded in the endpoint hostname, so it
        // belongs in configuration rather than being written into
        // source where it ends up in every clone of the repository.
        endpoint:
            process.env.R2_ENDPOINT ||
            (
                process.env.R2_ACCOUNT_ID
                    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
                    : null
            ),
    },

    ai: {
        ollamaUrl:
            process.env.OLLAMA_URL || null,

        ollamaModel:
            process.env.OLLAMA_MODEL || null,

        geminiApiKey:
            process.env.GEMINI_API_KEY || null,
    },

    /*
     * Where the Studio lives. Only used to point users at the page
     * that unlocks a premium feature, so an unset value degrades to a
     * plain path mention instead of breaking the command.
     */
    studio: {
        /*
         * The first candidate that is actually usable wins, so a leftover
         * dev-server value cannot shadow a real public domain.
         */
        url:
            resolveStudioUrl(process.env.STUDIO_URL, "STUDIO_URL") ||
            resolveStudioUrl(
                process.env.NEXT_PUBLIC_APP_URL,
                "NEXT_PUBLIC_APP_URL"
            ),
    },
};

module.exports = config;