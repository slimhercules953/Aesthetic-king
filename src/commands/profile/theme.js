const {
    SlashCommandBuilder,
    InteractionContextType,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    getMoodChoices,
} = require("../../data/moods");

const {
    prepareTheme,
    buildThemeResponse,
} = require("../../components/buttons/themeReroll");

const {
    withPackOption,
    resolveGenerationContext,
    respondToPackAutocomplete,
    buildPackUnavailableReply,
} = require("../../services/aesthetics/packContextService");

module.exports = {
    requireGenerationChannel: true,
    data: new SlashCommandBuilder()
        .setName("theme")
        .setDescription(
            "Generates a complete aesthetic Discord profile preview."
        )
        .addStringOption(withPackOption)
        .addStringOption((option) =>
            option
                .setName("style")
                .setDescription(
                    "Optionally choose the aesthetic style."
                )
                .setRequired(false)
                .addChoices(
                    ...getAestheticChoices()
                )
        )
        .addStringOption((option) =>
            option
                .setName("mood")
                .setDescription(
                    "Optionally choose the mood."
                )
                .setRequired(false)
                .addChoices(
                    ...getMoodChoices()
                )
        )
        // Server-scoped: packs, defaults and the generation channel are all
        // guild settings, so there is nothing sensible to generate in a DM.
        .setContexts(InteractionContextType.Guild),

    async autocomplete(interaction) {
        await respondToPackAutocomplete(
            interaction
        );
    },

    async execute(interaction) {
        /*
         * Resolved before deferring so the upsell can be ephemeral — see
         * `generateTheme`.
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

        const prepared = await prepareTheme({
            interaction,
            filters: {
                aestheticId: context.aestheticId,
                moodId: context.moodId,
            },
            pack: context.pack,
        });

        if (prepared.locked) {
            await interaction.reply(
                prepared.payload
            );

            return;
        }

        await interaction.deferReply();

        /*
         * The preview render happens after the defer so the slow banner
         * download and canvas work cannot blow the three-second window.
         */
        await interaction.editReply(
            await buildThemeResponse(
                interaction,
                prepared.profileSet,
                {
                    packName: prepared.packName,
                    packColors: prepared.packColors,
                    stateId: prepared.stateId,
                }
            )
        );
    },
};
