const {
    SlashCommandBuilder,
    EmbedBuilder,
    InteractionContextType,
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
        )
        // Server-scoped: packs and the generation channel are guild settings,
        // so there is nothing sensible to show in a DM.
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

        /*
         * An Aesthetic Pack stores a free-text aestheticId, so a pack can point
         * at a style the shipped catalogue has no symbols for. That is a
         * configuration gap, not a crash, so say so instead of throwing and
         * showing the generic error embed.
         */
        if (
            !aesthetic ||
            !symbols
        ) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(
                            "✦ No symbols for that style yet"
                        )
                        .setDescription(
                            `**${aesthetic?.name ?? aestheticId}** has no symbol collection yet. Pick one of the built-in styles with the \`style\` option, or choose a different Aesthetic Pack.`
                        )
                        .setColor(0x7c5cff),
                ],
                ephemeral: true,
            });

            return;
        }

        await interaction.deferReply();

        const embedColor =
            parseInt(
                (aesthetic.colors?.[0] ?? "#7c5cff")
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
                    context.packSymbols
                        .join(
                            "   "
                        )
                        .slice(
                            0,
                            1024
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
