const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require("discord.js");

const {
    getAestheticChoices,
    getAesthetic,
} = require("../../data/aesthetics");

const {
    getSymbolsForAesthetic,
} = require("../../data/symbols");

const {
    withPackOption,
    resolveGenerationContext,
    respondToPackAutocomplete,
    buildPackUnavailableReply,
    buildAestheticRequiredReply,
} = require("../../services/aesthetics/packContextService");

module.exports = {
    requireGenerationChannel: true,
    data: new SlashCommandBuilder()
        .setName("symbols")
        .setDescription(
            "Shows decorative symbols and dividers for an aesthetic."
        )
        .addStringOption(withPackOption)
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

        const aestheticId =
            context.aestheticId;

        const aesthetic =
            getAesthetic(
                aestheticId
            );

        const symbols =
            getSymbolsForAesthetic(
                aestheticId
            );

        if (
            !aesthetic ||
            !symbols
        ) {
            throw new Error(
                `No symbol collection exists for ${aestheticId}.`
            );
        }

        const embedColor =
            parseInt(
                aesthetic.colors[0]
                    .replace(
                        "#",
                        ""
                    ),
                16
            );

        const packName =
            context.pack?.name ?? null;

        /*
         * A Pack's symbols lead the list — that is the point of curating
         * them — but the aesthetic's full set follows so nobody loses the
         * library they already know.
         */
        const fields = [];

        if (
            packName &&
            context.packSymbols.length > 0
        ) {
            fields.push({
                name:
                    `✦ ${packName} Symbols`,
                value:
                    context.packSymbols.join(
                        "   "
                    ),
            });
        }

        fields.push(
            {
                name:
                    "Single Symbols",
                value:
                    symbols.singles.join(
                        "   "
                    ),
            },
            {
                name:
                    "Combinations",
                value:
                    symbols.combinations
                        .map(
                            (
                                combination
                            ) =>
                                `\`${combination}\``
                        )
                        .join(
                            "\n"
                        ),
            },
            {
                name:
                    "Dividers",
                value:
                    symbols.dividers
                        .map(
                            (
                                divider
                            ) =>
                                `\`${divider}\``
                        )
                        .join(
                            "\n"
                        ),
            }
        );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `✦ ${aesthetic.name} Symbols`
                )
                .setDescription(
                    packName
                        ? `Curated with the **${packName}** Aesthetic Pack. Copy these into bios, statuses, display names, channels, and other aesthetic text.`
                        : "Decorative symbols you can copy into bios, statuses, display names, channels, and other aesthetic text."
                )
                .setColor(
                    embedColor
                )
                .addFields(
                    ...fields
                )
                .setFooter({
                    text: packName
                        ? `Aesthetic King • ${packName} • Symbol Library`
                        : "Aesthetic King • Symbol Library",
                });

        await interaction.editReply({
            embeds: [
                embed,
            ],
        });
    },
};
