const { Events, MessageFlags } = require("discord.js");
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
                const baseCustomId = interaction.customId
                    .split(":")
                    .slice(0, 2)
                    .join(":");

                const buttonHandler = client.buttons.get(
                    baseCustomId
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
                flags: MessageFlags.Ephemeral,
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