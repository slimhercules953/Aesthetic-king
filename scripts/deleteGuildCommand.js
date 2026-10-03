const {
    REST,
    Routes,
} = require("discord.js");

const config =
    require("../src/config/env");

const logger =
    require("../src/utils/logger");

const COMMAND_NAME = "bio";

async function deleteGuildCommand() {
    const rest =
        new REST({
            version: "10",
        }).setToken(
            config.discord.token
        );

    const commands =
        await rest.get(
            Routes.applicationGuildCommands(
                config.discord.clientId,
                config.discord.devGuildId
            )
        );

    const command =
        commands.find(
            (item) =>
                item.name ===
                COMMAND_NAME
        );

    if (!command) {
        logger.warn(
            `Guild command /${COMMAND_NAME} was not found.`
        );

        return;
    }

    logger.info(
        `Deleting guild command /${COMMAND_NAME}...`
    );

    await rest.delete(
        Routes.applicationGuildCommand(
            config.discord.clientId,
            config.discord.devGuildId,
            command.id
        )
    );

    logger.success(
        `Guild command /${COMMAND_NAME} was deleted successfully.`
    );
}

deleteGuildCommand().catch(
    (error) => {
        logger.error(
            `Failed to delete guild command /${COMMAND_NAME}.`,
            error
        );

        process.exit(1);
    }
);