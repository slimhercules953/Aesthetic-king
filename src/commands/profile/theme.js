const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getRandomProfileSet,
} = require("../../services/assets/assetService");

const {
    buildThemeResponse,
} = require("../../components/buttons/themeReroll");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("theme")
        .setDescription(
            "Generates a complete aesthetic Discord profile preview."
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const profileSet =
            await getRandomProfileSet();

        const response =
            await buildThemeResponse(
                interaction,
                profileSet
            );

        await interaction.editReply(
            response
        );
    },
};