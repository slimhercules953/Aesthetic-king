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
    buildUsernameResponse,
} = require(
    "../../components/buttons/usernameReroll"
);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("username")
        .setDescription(
            "Generates aesthetic Discord username ideas."
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
                        "Optional inspiration for the usernames."
                    )
                    .setRequired(
                        false
                    )
                    .setMaxLength(
                        200
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
            await buildUsernameResponse({
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