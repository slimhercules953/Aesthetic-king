const {
    generateText,
} = require("../src/services/ai/ollamaProvider");

const logger = require("../src/utils/logger");

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