const {
    Events,
} = require("discord.js");

const logger = require("../utils/logger");

module.exports = {
    name: Events.InteractionCreate,

    async execute(client, interaction) {
        if (!interaction.isChatInputCommand()) {
            return;
        }

        const command = client.commands.get(
            interaction.commandName
        );

        if (!command) {
            logger.warn(
                `Command not found: ${interaction.commandName}`
            );

            return;
        }

        try {
            await command.execute(
                interaction,
                client
            );
        } catch (error) {
            logger.error(
                `Failed to execute /${interaction.commandName}`,
                error
            );

            const response = {
                content:
                    "Something went wrong while running this command.",
                ephemeral: true,
            };

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp(
                    response
                );
            } else {
                await interaction.reply(
                    response
                );
            }
        }
    },
};