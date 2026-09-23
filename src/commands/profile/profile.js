const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getRandomProfileSet,
} = require("../../services/assets/assetService");

const {
    buildProfileResponse,
} = require("../../components/buttons/profileReroll");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription(
            "Generates a matching aesthetic profile picture and banner."
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const profileSet =
            await getRandomProfileSet();

        await interaction.editReply(
            buildProfileResponse(profileSet)
        );
    },
};