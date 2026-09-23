const {
    Client,
    Collection,
    GatewayIntentBits,
} = require("discord.js");

const config = require("./config/env");
const logger = require("./utils/logger");
const loadCommands = require("./loaders/commandLoader");
const loadEvents = require("./loaders/eventLoader");
const loadButtons = require("./loaders/buttonLoader");

async function startBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
        ],
    });

    client.commands = new Collection();
    client.buttons = new Collection();

    try {
        logger.info(
            "Starting Aesthetic King V2..."
        );

        loadCommands(client);
        loadButtons(client);
        loadEvents(client);

        await client.login(
            config.discord.token
        );
    } catch (error) {
        logger.error(
            "Aesthetic King V2 failed to start.",
            error
        );

        process.exit(1);
    }
}

startBot();