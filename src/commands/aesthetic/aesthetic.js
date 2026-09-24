const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    buildAestheticResponse,
} = require("../../components/buttons/aestheticReroll");

const {
    getMoodChoices,
} = require("../../data/moods");

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
                .setName("color")
                .setDescription(
                    "Optionally filter the aesthetic by color."
                )
                .setRequired(false)
                .addChoices(
                    { name: "Black", value: "black" },
                    { name: "White", value: "white" },
                    { name: "Gray", value: "gray" },
                    { name: "Red", value: "red" },
                    { name: "Orange", value: "orange" },
                    { name: "Yellow", value: "yellow" },
                    { name: "Green", value: "green" },
                    { name: "Teal", value: "teal" },
                    { name: "Blue", value: "blue" },
                    { name: "Indigo", value: "indigo" },
                    { name: "Purple", value: "purple" },
                    { name: "Pink", value: "pink" },
                    { name: "Brown", value: "brown" },
                    { name: "Cream", value: "cream" },
                    { name: "Gold", value: "gold" }
                )
        )
        .addStringOption((option) =>
            option
                .setName("mood")
                .setDescription(
                    "Optionally choose the mood of your aesthetic."
                )
                .setRequired(false)
                .addChoices(
                    ...getMoodChoices()
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

        const mood =
            interaction.options.getString(
                "mood"
            ) || null;

        const aestheticId =
            interaction.options.getString(
                "style",
                true
            );

        const color =
            interaction.options.getString(
                "color"
            ) || null;

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
                color,
                mood,
                request,
            });

        await interaction.editReply(
            payload
        );
    },
};