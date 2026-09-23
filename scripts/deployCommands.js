const fs = require("fs");
const path = require("path");
const {
    REST,
    Routes,
} = require("discord.js");

const config = require("../src/config/env");
const logger = require("../src/utils/logger");

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

async function deployCommands() {
    const commandsDirectory = path.join(
        __dirname,
        "..",
        "src",
        "commands"
    );

    const commandFiles = getCommandFiles(commandsDirectory);

    const commands = [];

    for (const filePath of commandFiles) {
        const command = require(filePath);

        if (!command.data || typeof command.execute !== "function") {
            logger.warn(
                `Skipping invalid command file: ${filePath}`
            );
            continue;
        }

        commands.push(command.data.toJSON());
    }

    const rest = new REST({
        version: "10",
    }).setToken(config.discord.token);

    logger.info(
        `Deploying ${commands.length} command(s) to development guild...`
    );

    await rest.put(
        Routes.applicationGuildCommands(
            config.discord.clientId,
            config.discord.devGuildId
        ),
        {
            body: commands,
        }
    );

    logger.success(
        `Successfully deployed ${commands.length} development command(s).`
    );
}

deployCommands().catch((error) => {
    logger.error(
        "Failed to deploy development commands.",
        error
    );

    process.exit(1);
});