const { Events } = require("discord.js");
const logger = require("../utils/logger");

module.exports = {
    name: Events.InteractionCreate,

    async execute(client, interaction) {
        try {
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(
                    interaction.commandName
                );

                if (!command) {
                    logger.warn(
                        `Command not found: ${interaction.commandName}`
                    );

                    return;
                }

                await command.execute(
                    interaction,
                    client
                );

                return;
            }

            if (interaction.isButton()) {
                const buttonHandler = client.buttons.get(
                    interaction.customId
                );

                if (!buttonHandler) {
                    logger.warn(
                        `Button handler not found: ${interaction.customId}`
                    );

                    return;
                }

                await buttonHandler.execute(
                    interaction,
                    client
                );
            }
        } catch (error) {
            logger.error(
                "Interaction execution failed.",
                error
            );

            const response = {
                content:
                    "Something went wrong while processing that interaction.",
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