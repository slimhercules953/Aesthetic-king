const logger = require("../src/utils/logger");

/*
 * Also a live diagnostic: it asks a running Ollama server to generate text.
 * CI has no model loaded, so the check is only meaningful on a machine with
 * Ollama installed. See scripts/testR2.js for why this skips rather than
 * fails.
 *
 * There are two ways to have "no Ollama here", and only one of them is a
 * skip. OLLAMA_URL unset is the obvious one, but a developer who has Ollama
 * installed and simply has not started it has the variable set and no server
 * listening. Treating that as a failure made `runAllTests.js` exit non-zero on
 * an ordinary laptop with nothing wrong with the code, which trains everyone to
 * ignore the exit code — the one thing a test runner cannot afford.
 */
require("dotenv").config();

if (!process.env.OLLAMA_URL || !process.env.OLLAMA_MODEL) {
    logger.warn(
        "Skipping Ollama diagnostic — OLLAMA_URL/OLLAMA_MODEL not configured."
    );

    console.log("0 passed, 0 failed (skipped: no Ollama endpoint)");
    process.exit(0);
}

/**
 * Asks the server whether it is there before asking it to do any work.
 *
 * `/api/tags` is the cheapest endpoint Ollama serves and it needs no model to
 * be loaded, so it separates "nothing is listening" from "listening, but this
 * generation failed". A short timeout matters: a machine asleep on the local
 * network hangs far longer than a refused connection.
 */
async function probeServer() {
    const url = `${String(process.env.OLLAMA_URL).replace(/\/+$/, "")}/api/tags`;

    const response = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
    }).catch(() => null);

    return response !== null && response.ok;
}

async function main() {
    if (!(await probeServer())) {
        logger.warn(
            `Skipping Ollama diagnostic — nothing answered at ${process.env.OLLAMA_URL}.`
        );

        console.log("0 passed, 0 failed (skipped: Ollama server not running)");
        return;
    }

    const { generateText } = require("../src/services/ai/ollamaProvider");

    logger.info("Testing Ollama generation...");

    const response = await generateText(
        [
            "Create one short aesthetic Discord bio.",
            "Style: dreamcore.",
            "Keep it under 120 characters.",
            "Return only the bio.",
        ].join("\n")
    );

    logger.success("Ollama generation successful.");

    console.log("");
    console.log(response);
}

main().catch((error) => {
    logger.error("Ollama diagnostic failed.", error);

    process.exit(1);
});
