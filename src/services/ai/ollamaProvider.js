const config = require("../../config/env");

function validateOllamaConfig() {
    if (!config.ai.ollamaUrl) {
        throw new Error(
            "OLLAMA_URL is not configured."
        );
    }

    if (!config.ai.ollamaModel) {
        throw new Error(
            "OLLAMA_MODEL is not configured."
        );
    }
}

/**
 * Retries for a throttled or overloaded inference server.
 *
 * Ollama serialises requests per model, so concurrent generations queue and
 * the server answers 429/503 rather than slowing down. Without a retry, one
 * busy moment turns into an error embed for the member even though the request
 * would have succeeded a second later.
 *
 * Two attempts is the whole budget. A generation takes seconds, and a member
 * staring at a "thinking" message is worse off after three retries than after
 * one clean failure they can act on.
 */
const MAX_ATTEMPTS = 2;

const RETRYABLE_STATUS = new Set([
    429,
    500,
    502,
    503,
    504,
]);

/**
 * Discord's own limit is 3 seconds to answer an interaction, but the command
 * has already deferred by the time this runs, so a wait measured in seconds is
 * acceptable. Anything longer is a broken server, not a busy one.
 */
const MAX_RETRY_DELAY_MS = 5_000;

const DEFAULT_RETRY_DELAY_MS = 1_000;

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Honours the server's `Retry-After` when it sends one.
 *
 * The header is allowed as either seconds or an HTTP-date, and a value we
 * cannot parse falls back to a short fixed delay rather than to no delay —
 * retrying immediately against a server that just said "back off" is how a
 * throttle becomes an outage.
 */
function getRetryDelayMs(response, attempt) {
    const header = response.headers.get("retry-after");

    if (header) {
        const seconds = Number(header);

        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(
                seconds * 1000,
                MAX_RETRY_DELAY_MS
            );
        }

        const date = Date.parse(header);

        if (!Number.isNaN(date)) {
            return Math.min(
                Math.max(0, date - Date.now()),
                MAX_RETRY_DELAY_MS
            );
        }
    }

    return Math.min(
        DEFAULT_RETRY_DELAY_MS * 2 ** attempt,
        MAX_RETRY_DELAY_MS
    );
}

async function requestGeneration(body) {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const response = await fetch(
            `${config.ai.ollamaUrl}/api/generate`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body,
            }
        ).catch((error) => {
            /*
             * A connection failure is not retryable here: it means Ollama is
             * unreachable rather than busy, and the message the member needs is
             * "the generator is down", not a second of extra waiting.
             */
            throw new Error(
                `Could not reach the generation service: ${error.message}`
            );
        });

        if (response.ok) {
            return response;
        }

        const failure = new Error(
            `Ollama request failed: ${response.status} ${response.statusText}`
        );

        if (
            !RETRYABLE_STATUS.has(response.status) ||
            attempt === MAX_ATTEMPTS - 1
        ) {
            throw failure;
        }

        lastError = failure;

        await sleep(
            getRetryDelayMs(response, attempt)
        );
    }

    throw lastError;
}

async function generateText(prompt) {
    if (
        typeof prompt !== "string" ||
        !prompt.trim()
    ) {
        throw new Error(
            "A prompt is required."
        );
    }

    validateOllamaConfig();

    const response = await requestGeneration(
        JSON.stringify({
            model: config.ai.ollamaModel,
            prompt,
            stream: false,
            think: false,

            options: {
                temperature: 0.9,
                num_predict: 200,
            },
        })
    );

    const data = await response.json();

    if (
        !data.response ||
        !data.response.trim()
    ) {
        throw new Error(
            "Ollama returned an empty response."
        );
    }

    return data.response.trim();
}

module.exports = {
    generateText,
};