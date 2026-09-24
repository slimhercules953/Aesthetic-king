const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    generateBio,
} = require("../../services/ai/bioService");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    buildBioResponse,
} = require("../../components/buttons/bioReroll");

module.exports = {
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
                .setRequired(true)
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

        const aestheticId =
            interaction.options.getString(
                "aesthetic",
                true
            );

        const request =
            interaction.options.getString(
                "prompt"
            ) || "";

        const {
            bio,
            aesthetic,
        } = await generateBio({
            aestheticId,
            request,
        });

        await interaction.editReply(
            buildBioResponse({
                bio,
                aesthetic,
                request,
            })
        );
    },
};