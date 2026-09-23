const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

function loadEvents(client) {
    const eventsDirectory = path.join(
        __dirname,
        "..",
        "events"
    );

    const eventFiles = fs
        .readdirSync(eventsDirectory)
        .filter((file) => file.endsWith(".js"));

    for (const file of eventFiles) {
        const filePath = path.join(
            eventsDirectory,
            file
        );

        const event = require(filePath);

        if (!event.name || typeof event.execute !== "function") {
            logger.warn(
                `Skipping invalid event file: ${file}`
            );

            continue;
        }

        if (event.once) {
            client.once(
                event.name,
                (...args) =>
                    event.execute(client, ...args)
            );
        } else {
            client.on(
                event.name,
                (...args) =>
                    event.execute(client, ...args)
            );
        }

        logger.info(
            `Loaded event: ${event.name}`
        );
    }
}

module.exports = loadEvents;