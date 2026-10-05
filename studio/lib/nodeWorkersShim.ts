/*
 * Node replacement for the `cloudflare:workers` module.
 *
 * Five modules (`lib/database.ts`, `lib/ollama.ts`, `lib/devTools.ts`,
 * `lib/discordBot.ts`, `lib/botInvite.ts`) read configuration from Workers
 * bindings. Under `vite.config.cloudflare.ts` they get the real thing. Under
 * `vite.config.node.ts` this file is aliased in place of `cloudflare:workers`
 * (see the `resolve.alias` entry there), so the same source runs on a plain
 * Node server without every call site having to care which platform it is on.
 *
 * The shape mirrors the subset of the real module the Studio uses:
 *
 *   - named lookups fall through to `process.env`, which is what
 *     `readSetting()`/`readSecret()` in the three "read both" helpers already
 *     expect. Those helpers would work with an empty object here, but
 *     returning the value keeps the bindings-first path honest rather than
 *     silently relying on the fallback half of every call site.
 *   - `HYPERDRIVE` is synthesised from `DATABASE_URL` because a Hyperdrive
 *     binding is a *connection string in a wrapper*, and on Node the
 *     connection string is all there is.
 *   - `OLLAMA` is a service binding, which is an object with `fetch()` rather
 *     than a string. It is replaced with a `fetch()` that rewrites the
 *     `http://ollama.internal` service-binding URL onto a real HTTP endpoint
 *     from `OLLAMA_URL`.
 *
 * A missing binding throws on read rather than at import, matching the real
 * module: a misconfigured environment should fail the one request that needed
 * the secret, not take the whole process down at startup.
 */

/** Bindings that are plain strings, mapped to their environment variable. */
const STRING_BINDINGS: Record<string, string> = {
    DISCORD_BOT_TOKEN: "DISCORD_BOT_TOKEN",
    DISCORD_CLIENT_ID: "DISCORD_CLIENT_ID",
    DISCORD_CLIENT_SECRET: "DISCORD_CLIENT_SECRET",
    SESSION_SECRET: "SESSION_SECRET",
    OAUTH_TOKEN_ENCRYPTION_KEY: "OAUTH_TOKEN_ENCRYPTION_KEY",
    STRIPE_SECRET_KEY: "STRIPE_SECRET_KEY",
    STRIPE_WEBHOOK_SECRET: "STRIPE_WEBHOOK_SECRET",
    TOPGG_WEBHOOK_SECRET: "TOPGG_WEBHOOK_SECRET",
    OLLAMA_MODEL: "OLLAMA_MODEL",
    ALLOW_DEV_TOOLS: "ALLOW_DEV_TOOLS",
    APP_ORIGIN: "APP_ORIGIN",
};

function missing(name: string): never {
    throw new Error(
        `Binding "${name}" is not configured. On Node it is read from the ` +
        `${STRING_BINDINGS[name] ?? name} environment variable.`,
    );
}

/**
 * The URL the Ollama service binding is swapped for.
 *
 * `http://ollama.internal` is a name that only resolves inside the Workers
 * VPC, so leaving it in place would produce a DNS failure that looks like an
 * Ollama outage rather than a missing `OLLAMA_URL`.
 */
const OLLAMA_BINDING_ORIGIN = "http://ollama.internal";

function ollamaFetch(
    input: string | URL | Request,
    init?: RequestInit,
): Promise<Response> {
    const base = process.env.OLLAMA_URL;
    if (!base) {
        throw new Error(
            "Binding \"OLLAMA\" is not configured. On Node, set OLLAMA_URL " +
            "to the HTTP address of your Ollama server " +
            "(e.g. http://127.0.0.1:11434).",
        );
    }

    const href =
        typeof input === "string"
            ? input
            : input instanceof URL
                ? input.href
                : input.url;

    const rewritten = href.startsWith(OLLAMA_BINDING_ORIGIN)
        ? base.replace(/\/+$/, "") + href.slice(OLLAMA_BINDING_ORIGIN.length)
        : href;

    return fetch(rewritten, init);
}

/**
 * Bindings, read lazily.
 *
 * A `Proxy` rather than a literal object so that an unknown binding reports
 * the same "not configured" error as a known-but-unset one instead of
 * `undefined`, and so a value changed in the environment after startup is
 * picked up rather than frozen at import time.
 */
export const env: Record<string, unknown> = new Proxy(
    {},
    {
        get(_target, property: string) {
            if (property === "HYPERDRIVE") {
                const connectionString =
                    process.env.HYPERDRIVE_CONNECTION_STRING ??
                    process.env.DATABASE_URL;
                return connectionString
                    ? { connectionString }
                    : missing("HYPERDRIVE");
            }

            if (property === "OLLAMA") {
                return { fetch: ollamaFetch };
            }

            const variable = STRING_BINDINGS[property] ?? property;
            return process.env[variable] ?? missing(property);
        },

        has(_target, property: string) {
            return (
                property === "HYPERDRIVE" ||
                property === "OLLAMA" ||
                property in STRING_BINDINGS ||
                property in process.env
            );
        },
    },
);

export default { env };
