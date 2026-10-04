import {
    ExpectedError,
} from "./apiError";

import {
    env,
} from "cloudflare:workers";

type OllamaGenerateResponse = {
    response: string;
};

export type OllamaOptions = {
    /**
     * Constrain the reply to JSON. Callers that parse the answer should set
     * this: without it a model will occasionally wrap the object in prose or
     * a stray sentence, and `extractJson` has nothing to salvage.
     */
    json?: boolean;
};

export async function generateOllamaText(
    prompt: string,
    options: OllamaOptions = {}
) {
    if (
        !prompt ||
        !prompt.trim()
    ) {
        throw new ExpectedError(
            "An Ollama prompt is required."
        );
    }

    const model =
        process.env.OLLAMA_MODEL ||
        "qwen3.5:latest";

    const response =
        await env.OLLAMA.fetch(
            "http://ollama.internal/api/generate",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",
                },

                body:
                    JSON.stringify({
                        model,
                        prompt,
                        stream: false,
                        think: false,
                        ...(options.json
                            ? { format: "json" }
                            : {}),
                    }),
            }
        );

    if (!response.ok) {
        const body =
            await response.text();

        // Upstream bodies name internal hosts and model-registry
        // details; keep them in the log only.
        console.error(
            `Ollama request failed: ${response.status} ${response.statusText} - ${body}`
        );

        throw new Error(
            "The generation service is unavailable right now. Please try again shortly."
        );
    }

    const result =
        await response.json() as
            OllamaGenerateResponse;

    return result.response.trim();
}