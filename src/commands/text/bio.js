const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    buildBioResponse,
} = require("../../components/buttons/bioReroll");

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

    /*
     * Generation is the one thing worth metering per member: every run costs an
     * AI call, and reroll buttons share the same bucket.
     */
    rateLimitScope: "generation",

    data: new SlashCommandBuilder()
        .setName("bio")
        .setDescription(
            "Generates an aesthetic Discord bio."
        )
        .addStringOption(withPackOption)
        .addStringOption((option) =>
            option
                .setName("aesthetic")
                .setDescription(
                    "Choose your aesthetic."
                )
                .setRequired(false)
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

    async autocomplete(interaction) {
        await respondToPackAutocomplete(
            interaction
        );
    },

    async execute(interaction) {
        /*
         * Same ladder as every other generation command: the typed option,
         * then the server's default Aesthetic Pack, then the server default
         * aesthetic. Resolving it here (rather than reading the default
         * directly) is what lets a configured Pack drive `/bio`.
         */
        const context =
            await resolveGenerationContext({
                interaction,
                aestheticId:
                    interaction.options.getString(
                        "aesthetic"
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
                    "Choose an aesthetic, select an Aesthetic Pack, or ask a server manager to configure a default aesthetic in Aesthetic King Studio."
                )
            );

            return;
        }

        await interaction.deferReply();

        // Only the fields the prompt reads are kept, so nothing extra about
        // the Pack drifts into the AI prompt.
        const pack = context.pack
            ? {
                  name: context.pack.name,
                  description:
                      context.pack.description ?? null,
                  symbols: context.packSymbols,
              }
            : null;

        const response =
            await buildBioResponse({
                interaction,
                aestheticId:
                    context.aestheticId,
                request:
                    interaction.options.getString(
                        "prompt"
                    ) || "",
                pack,
            });

        await interaction.editReply(
            response
        );
    },
};
