const {
    Events,
} = require("discord.js");

const logger =
    require("../utils/logger");

const {
    removeGuildByDiscordId,
} = require(
    "../services/database/guildService"
);

module.exports = {
    name: Events.GuildDelete,

    async execute(
        client,
        guild
    ) {
        try {
            await removeGuildByDiscordId(
                guild.id
            );

            logger.info(
                `Removed guild from database: ${guild.name} (${guild.id})`
            );
        } catch (error) {
            logger.error(
                `Failed to remove guild from database: ${guild.id}`,
                error
            );
        }
    },
};