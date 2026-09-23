const {
    REST,
    Routes,
} = require("discord.js");

const config = require("../src/config/env");
const logger = require("../src/utils/logger");

async function clearGuildCommands() {
    const rest = new REST({
        version: "10",
    }).setToken(config.discord.token);

    logger.info(
        `Clearing all commands from development guild ${config.discord.devGuildId}...`
    );

    await rest.put(
        Routes.applicationGuildCommands(
            config.discord.clientId,
            config.discord.devGuildId
        ),
        {
            body: [],
        }
    );

    logger.success(
        "All development guild commands have been removed."
    );
}

clearGuildCommands().catch((error) => {
    logger.error(
        "Failed to clear development guild commands.",
        error
    );

    process.exit(1);
});