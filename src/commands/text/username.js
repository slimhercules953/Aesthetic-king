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

const {
    getDefaultAestheticId,
} = require(
    "../../services/database/guildSettingsService"
);

module.exports = {
    requireGenerationChannel: true,
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
                        false
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

        let aestheticId =
            interaction.options
                .getString(
                    "style"
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
                "Choose an aesthetic style, or ask a server manager to configure a default aesthetic in Aesthetic King Studio."
            );

            return;
        }

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