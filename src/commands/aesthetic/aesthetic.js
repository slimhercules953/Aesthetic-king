const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    buildAestheticResponse,
} = require("../../components/buttons/aestheticReroll");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("aesthetic")
        .setDescription(
            "Generates a complete matching Discord aesthetic."
        )
        .addStringOption((option) =>
            option
                .setName("style")
                .setDescription(
                    "Choose your aesthetic style."
                )
                .setRequired(true)
                .addChoices(
                    ...getAestheticChoices()
                )
        )
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription(
                    "Optional inspiration for your bio."
                )
                .setRequired(false)
                .setMaxLength(300)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const aestheticId =
            interaction.options.getString(
                "style",
                true
            );

        const request =
            interaction.options.getString(
                "prompt"
            ) || "";

        const {
            payload,
        } =
            await buildAestheticResponse({
                interaction,
                aestheticId,
                request,
            });

        await interaction.editReply(
            payload
        );
    },
};