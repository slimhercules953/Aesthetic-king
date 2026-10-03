const {
    Events,
} = require("discord.js");

const logger =
    require("../utils/logger");

const {
    upsertGuildFromDiscord,
} = require(
    "../services/database/guildService"
);

module.exports = {
    name: Events.GuildCreate,

    async execute(
        client,
        guild
    ) {
        try {
            await upsertGuildFromDiscord(
                guild
            );

            logger.success(
                `Synchronized new guild: ${guild.name} (${guild.id})`
            );
        } catch (error) {
            logger.error(
                `Failed to synchronize new guild: ${guild.id}`,
                error
            );
        }
    },
};