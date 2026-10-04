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
    buildUsernameResponse,
} = require(
    "../../components/buttons/usernameReroll"
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

    /*
     * Generation is the one thing worth metering per member: every run costs an
     * AI call, and reroll buttons share the same bucket.
     */
    rateLimitScope: "generation",

    data: new SlashCommandBuilder()
        .setName("username")
        .setDescription(
            "Generates aesthetic Discord username ideas."
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
                        "Optional inspiration for the usernames."
                    )
                    .setRequired(
                        false
                    )
                    .setMaxLength(
                        200
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
         * Usernames cannot contain decorative characters, so only the Pack's
         * name and description steer the output — never its symbols.
         */
        const pack = context.pack
            ? {
                  name: context.pack.name,
                  description:
                      context.pack.description ?? null,
              }
            : null;

        const response =
            await buildUsernameResponse({
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