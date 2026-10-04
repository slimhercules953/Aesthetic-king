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
    generateProfile,
} = require("../../components/buttons/profileReroll");

const {
    withPackOption,
    resolveGenerationContext,
    respondToPackAutocomplete,
    buildPackUnavailableReply,
} = require("../../services/aesthetics/packContextService");

module.exports = {
    requireGenerationChannel: true,
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription(
            "Generates a matching aesthetic profile picture and banner."
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
         * The pack/style/mood ladder resolves before the reply is deferred
         * so a premium-only match can still be answered ephemerally — see
         * `generateProfile`.
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

        const {
            locked,
            payload,
        } = await generateProfile({
            interaction,
            filters: {
                aestheticId: context.aestheticId,
                moodId: context.moodId,
            },
            packName: context.pack?.name ?? null,
        });

        if (locked) {
            await interaction.reply(payload);
            return;
        }

        await interaction.deferReply();

        await interaction.editReply(payload);
    },
};
