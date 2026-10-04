const logger = require("../src/utils/logger");

/*
 * Also a live diagnostic: it asks a running Ollama server to generate text.
 * CI has no model loaded, so the check is only meaningful on a machine with
 * Ollama installed. See scripts/testR2.js for why this skips rather than
 * fails.
 */
require("dotenv").config();

if (!process.env.OLLAMA_URL || !process.env.OLLAMA_MODEL) {
    logger.warn(
        "Skipping Ollama diagnostic — OLLAMA_URL/OLLAMA_MODEL not configured."
    );

    console.log("0 passed, 0 failed (skipped: no Ollama endpoint)");
    process.exit(0);
}

const {
    generateText,
} = require("../src/services/ai/ollamaProvider");

async function testOllama() {
    logger.info(
        "Testing Ollama generation..."
    );

    const response =
        await generateText(
            [
                "Create one short aesthetic Discord bio.",
                "Style: dreamcore.",
                "Keep it under 120 characters.",
                "Return only the bio.",
            ].join("\n")
        );

    logger.success(
        "Ollama generation successful."
    );

    console.log("");
    console.log(response);
}

testOllama().catch((error) => {
    logger.error(
        "Ollama diagnostic failed.",
        error
    );

    process.exit(1);
});