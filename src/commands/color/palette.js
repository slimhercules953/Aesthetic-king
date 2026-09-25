const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
} = require(
    "../../data/aesthetics"
);

const {
    getMoodChoices,
} = require(
    "../../data/moods"
);

const {
    buildPaletteResponse,
} = require(
    "../../components/buttons/paletteReroll"
);

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName(
                "palette"
            )
            .setDescription(
                "Generates a color palette for an aesthetic."
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
                            "Optionally influence the palette with a mood."
                        )
                        .setRequired(
                            false
                        )
                        .addChoices(
                            ...getMoodChoices()
                        )
            ),

    async execute(
        interaction
    ) {
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

        const response =
            await buildPaletteResponse({
                interaction,
                aestheticId,
                moodId,
            });

        await interaction.editReply(
            response
        );
    },
};