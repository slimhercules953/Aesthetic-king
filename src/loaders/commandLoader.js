const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

function getCommandFiles(directory) {
    const entries = fs.readdirSync(directory, {
        withFileTypes: true,
    });

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...getCommandFiles(fullPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

function loadCommands(client) {
    const commandsDirectory = path.join(
        __dirname,
        "..",
        "commands"
    );

    const commandFiles = getCommandFiles(commandsDirectory);

    for (const filePath of commandFiles) {
        const command = require(filePath);

        if (!command.data || typeof command.execute !== "function") {
            logger.warn(
                `Skipping invalid command file: ${filePath}`
            );
            continue;
        }

        const commandName = command.data.name;

        if (client.commands.has(commandName)) {
            throw new Error(
                `Duplicate command detected: ${commandName}`
            );
        }

        client.commands.set(commandName, command);

        logger.info(
            `Loaded command: /${commandName}`
        );
    }
}

module.exports = loadCommands;