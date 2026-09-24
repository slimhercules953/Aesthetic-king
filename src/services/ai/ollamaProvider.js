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

    const response = await fetch(
        `${config.ai.ollamaUrl}/api/generate`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                model: config.ai.ollamaModel,
                prompt,
                stream: false,
                think: false,

                options: {
                    temperature: 0.9,
                    num_predict: 200,
                },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `Ollama request failed: ${response.status} ${response.statusText}`
        );
    }

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