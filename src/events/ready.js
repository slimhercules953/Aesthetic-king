const {
    Events,
    ActivityType,
} = require("discord.js");

const logger = require("../utils/logger");

module.exports = {
    name: Events.ClientReady,
    once: true,

    async execute(client) {
        logger.success(
            `Logged in as ${client.user.tag}`
        );

        client.user.setActivity(
            "your aesthetic identity",
            {
                type: ActivityType.Watching,
            }
        );

        logger.info(
            `Serving ${client.guilds.cache.size} server(s)`
        );

        logger.info(
            `Loaded ${client.commands.size} command(s)`
        );
    },
};