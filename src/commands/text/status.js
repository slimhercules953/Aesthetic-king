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
    data: new SlashCommandBuilder()
        .setName("status")
        .setDescription(
            "Generates aesthetic Discord status ideas."
        )
        .addStringOption(withPackOption)
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
                        "Optional inspiration for the statuses."
                    )
                    .setRequired(
                        false
                    )
                    .setMaxLength(
                        300
                    )
        ),

    async autocomplete(interaction) {
        await respondToPackAutocomplete(
            interaction
        );
    },

    async execute(interaction) {
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
                    "Choose an aesthetic style, select an Aesthetic Pack, or ask a server manager to configure a default aesthetic in Aesthetic King Studio."
                )
            );

            return;
        }

        await interaction.deferReply();

        /*
         * Only the fields the prompt actually uses are kept — and later
         * stored in reroll state — so nothing extra about the Pack drifts
         * into the AI prompt.
         */
        const pack = context.pack
            ? {
                  name: context.pack.name,
                  description:
                      context.pack.description ?? null,
                  symbols: context.packSymbols,
              }
            : null;

        const response =
            await buildStatusResponse({
                interaction,
                aestheticId:
                    context.aestheticId,
                moodId: context.moodId,
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
