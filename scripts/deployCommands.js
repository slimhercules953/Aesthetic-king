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

/**
 * Slash-command deployment.
 *
 * Guild-scoped (the default) is for development: Discord applies guild command
 * changes immediately, so iterating on a builder takes seconds. Global commands
 * can take up to an hour to appear, which makes them unusable while developing
 * but is the only way to reach every server the bot is in.
 *
 *   node scripts/deployCommands.js            # dev guild
 *   node scripts/deployCommands.js --prod     # global
 *
 * `--prod` replaces the global command list wholesale, so anything not built
 * from `src/commands` disappears from every server at once.
 */
async function deployCommands() {
    const production = process.argv.includes("--prod");

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

    /*
     * Global deployment needs no guild id, and a typo in `--pro` must not
     * silently publish to the dev guild instead — so only the exact flag is
     * accepted and anything else is reported.
     */
    const unknownArgs = process.argv
        .slice(2)
        .filter((arg) => arg !== "--prod");

    if (unknownArgs.length > 0) {
        throw new Error(
            `Unknown argument(s): ${unknownArgs.join(", ")}. Use --prod to deploy globally.`
        );
    }

    if (production) {
        logger.info(
            `Deploying ${commands.length} command(s) globally...`
        );

        await rest.put(
            Routes.applicationCommands(
                config.discord.clientId
            ),
            {
                body: commands,
            }
        );

        logger.success(
            `Successfully deployed ${commands.length} global command(s). Global commands can take up to an hour to appear.`
        );

        return;
    }

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
        "Failed to deploy commands.",
        error
    );

    process.exit(1);
});