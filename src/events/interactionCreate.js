const {
    Events,
    MessageFlags,
} = require("discord.js");

const logger =
    require("../utils/logger");

const {
    getGenerationChannelId,
} = require(
    "../services/database/guildSettingsService"
);

const {
    isGuildCommandEnabled,
} = require(
    "../services/database/guildCommandService"
);

const {
    buildCommandDisabledEmbed,
    buildWrongChannelEmbed,
    buildInteractionErrorEmbed,
} = require(
    "../components/embeds/systemResponse"
);

module.exports = {
    name: Events.InteractionCreate,

    async execute(
        client,
        interaction
    ) {
        try {
            if (
                interaction.isAutocomplete()
            ) {
                const command =
                    client.commands.get(
                        interaction.commandName
                    );

                if (
                    !command ||
                    typeof command.autocomplete !==
                        "function"
                ) {
                    return;
                }

                await command.autocomplete(
                    interaction,
                    client
                );

                return;
            }

            if (
                interaction.isChatInputCommand()
            ) {
                const command =
                    client.commands.get(
                        interaction.commandName
                    );

                if (!command) {
                    logger.warn(
                        `Command not found: ${interaction.commandName}`
                    );

                    return;
                }

                if (
                    interaction.guildId &&
                    interaction.commandName !==
                        "ping"
                ) {
                    const enabled =
                        await isGuildCommandEnabled(
                            interaction.guildId,
                            interaction.commandName
                        );

                    if (!enabled) {
                        await interaction.reply({
                            embeds: [
                                buildCommandDisabledEmbed(
                                    interaction.commandName
                                ),
                            ],

                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }
                }

                if (
                    command.requireGenerationChannel &&
                    interaction.guildId
                ) {
                    const generationChannelId =
                        await getGenerationChannelId(
                            interaction.guildId
                        );

                    if (
                        generationChannelId &&
                        interaction.channelId !==
                            generationChannelId
                    ) {
                        await interaction.reply({
                            embeds: [
                                buildWrongChannelEmbed(
                                    generationChannelId
                                ),
                            ],

                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }
                }

                await command.execute(
                    interaction,
                    client
                );

                return;
            }

            if (
                interaction.isButton()
            ) {
                const baseCustomId =
                    interaction.customId
                        .split(":")
                        .slice(0, 2)
                        .join(":");

                const buttonHandler =
                    client.buttons.get(
                        baseCustomId
                    );

                if (
                    !buttonHandler
                ) {
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

            if (
                interaction.isAutocomplete()
            ) {
                try {
                    await interaction.respond(
                        []
                    );
                } catch {}

                return;
            }

            const response = {
                embeds: [
                    buildInteractionErrorEmbed(),
                ],

                flags:
                    MessageFlags.Ephemeral,
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
