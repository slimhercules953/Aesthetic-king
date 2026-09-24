const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    getMoodChoices,
} = require("../../data/moods");

const {
    buildStatusResponse,
} = require(
    "../../components/buttons/statusReroll"
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription(
            "Generates aesthetic Discord status ideas."
        )
        .addStringOption(
            (option) =>
                option
                    .setName(
                        "style"
                    )
                    .setDescription(
                        "Choose the aesthetic style."
                    )
                    .setRequired(
                        true
                    )
                    .addChoices(
                        ...getAestheticChoices()
                    )
        )
        .addStringOption(
            (option) =>
                option
                    .setName(
                        "mood"
                    )
                    .setDescription(
                        "Optionally choose a mood."
                    )
                    .setRequired(
                        false
                    )
                    .addChoices(
                        ...getMoodChoices()
                    )
        )
        .addStringOption(
            (option) =>
                option
                    .setName(
                        "prompt"
                    )
                    .setDescription(
                        "Optional inspiration for the statuses."
                    )
                    .setRequired(
                        false
                    )
                    .setMaxLength(
                        300
                    )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const aestheticId =
            interaction.options
                .getString(
                    "style",
                    true
                );

        const moodId =
            interaction.options
                .getString(
                    "mood"
                ) || null;

        const request =
            interaction.options
                .getString(
                    "prompt"
                ) || "";

        const response =
            await buildStatusResponse({
                interaction,
                aestheticId,
                moodId,
                request,
            });

        await interaction.editReply(
            response
        );
    },
};