const {
    REST,
    Routes,
} = require("discord.js");

const config = require("../src/config/env");
const logger = require("../src/utils/logger");

async function clearGlobalCommands() {
    const rest = new REST({
        version: "10",
    }).setToken(config.discord.token);

    logger.info(
        `Clearing all global application commands for ${config.discord.clientId}...`
    );

    await rest.put(
        Routes.applicationCommands(
            config.discord.clientId
        ),
        {
            body: [],
        }
    );

    logger.success(
        "All global application commands have been removed."
    );
}

clearGlobalCommands().catch((error) => {
    logger.error(
        "Failed to clear global application commands.",
        error
    );

    process.exit(1);
});