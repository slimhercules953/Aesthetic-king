const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    buildBioResponse,
} = require("../../components/buttons/bioReroll");

const {
    getDefaultAestheticId,
} = require(
    "../../services/database/guildSettingsService"
);

module.exports = {
    requireGenerationChannel: true,
    data: new SlashCommandBuilder()
        .setName("bio")
        .setDescription(
            "Generates an aesthetic Discord bio."
        )
        .addStringOption((option) =>
            option
                .setName("aesthetic")
                .setDescription(
                    "Choose your aesthetic."
                )
                .setRequired(false)
                .addChoices(
                    ...getAestheticChoices()
                )
        )
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription(
                    "Describe what you want your bio to be about."
                )
                .setRequired(false)
                .setMaxLength(300)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        let aestheticId =
            interaction.options.getString(
                "aesthetic"
            );

        if (
            !aestheticId &&
            interaction.guildId
        ) {
            aestheticId =
                await getDefaultAestheticId(
                    interaction.guildId
                );
        }

        if (!aestheticId) {
            await interaction.editReply(
                "Choose an aesthetic, or ask a server manager to configure a default aesthetic in Aesthetic King Studio."
            );

            return;
        }

        const request =
            interaction.options.getString(
                "prompt"
            ) || "";

        const response =
            await buildBioResponse({
                interaction,
                aestheticId,
                request,
            });

        await interaction.editReply(
            response
        );
    },
};