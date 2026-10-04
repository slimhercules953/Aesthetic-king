const {
    SlashCommandBuilder,
    InteractionContextType,
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

const {
    withPackOption,
    resolveGenerationContext,
    respondToPackAutocomplete,
    buildPackUnavailableReply,
    buildAestheticRequiredReply,
} = require(
    "../../services/aesthetics/packContextService"
);

module.exports = {
    requireGenerationChannel: true,
    data:
        new SlashCommandBuilder()
            .setName(
                "palette"
            )
            .setDescription(
                "Generates a color palette for an aesthetic."
            )
            .addStringOption(
                withPackOption
            )
            .addStringOption(
                (option) =>
                    option
                        .setName(
                            "style"
                        )
                        .setDescription(
                            "Optionally choose the aesthetic style."
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
                            "Optionally influence the palette with a mood."
                        )
                        .setRequired(
                            false
                        )
                        .addChoices(
                            ...getMoodChoices()
                        )
            )
            // Server-scoped: packs, defaults and the generation channel are
            // all guild settings, so there is nothing to generate in a DM.
            .setContexts(InteractionContextType.Guild),

    async autocomplete(
        interaction
    ) {
        await respondToPackAutocomplete(
            interaction
        );
    },

    async execute(
        interaction
    ) {
        /*
         * `style` used to be required, which meant a server default Pack
         * could never drive the palette. It is now the first link in the
         * option -> Pack -> server-default ladder.
         */
        const context =
            await resolveGenerationContext({
                interaction,
                aestheticId:
                    interaction.options.getString(
                        "style"
                    ),
                moodId:
                    interaction.options.getString(
                        "mood"
                    ),
            });

        if (context.packUnavailable) {
            await interaction.reply(
                buildPackUnavailableReply()
            );

            return;
        }

        if (context.missingAesthetic) {
            await interaction.reply(
                buildAestheticRequiredReply(
                    "Choose an aesthetic style, select an Aesthetic Pack, or ask a server manager to configure a default aesthetic."
                )
            );

            return;
        }

        await interaction.deferReply();

        const response =
            await buildPaletteResponse({
                interaction,
                aestheticId:
                    context.aestheticId,
                moodId: context.moodId,
                packName:
                    context.pack?.name ??
                    null,
                packColors:
                    context.packColors,
            });

        await interaction.editReply(
            response
        );
    },
};
