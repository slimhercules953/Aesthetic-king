const {
    Events,
    ActivityType,
} = require("discord.js");

const logger =
    require("../utils/logger");

const {
    syncGuildsFromDiscord,
} = require(
    "../services/database/guildService"
);

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
                type:
                    ActivityType.Watching,
            }
        );

        try {
            await syncGuildsFromDiscord(
                client.guilds.cache
            );

            logger.success(
                `Synchronized ${client.guilds.cache.size} guild(s) with PostgreSQL.`
            );
        } catch (error) {
            logger.error(
                "Failed to synchronize guilds with PostgreSQL.",
                error
            );
        }

        logger.info(
            `Serving ${client.guilds.cache.size} server(s)`
        );

        logger.info(
            `Loaded ${client.commands.size} command(s)`
        );
    },
};