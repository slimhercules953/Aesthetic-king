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

module.exports = {
    data: new SlashCommandBuilder()
        .setName("symbols")
        .setDescription(
            "Shows decorative symbols and dividers for an aesthetic."
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
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const aestheticId =
            interaction.options
                .getString(
                    "style",
                    true
                );

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

        const embed =
            new EmbedBuilder()
                .setTitle(
                    `✦ ${aesthetic.name} Symbols`
                )
                .setDescription(
                    "Decorative symbols you can copy into bios, statuses, display names, channels, and other aesthetic text."
                )
                .setColor(
                    embedColor
                )
                .addFields(
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
                )
                .setFooter({
                    text:
                        "Aesthetic King • Symbol Library",
                });

        await interaction.editReply({
            embeds: [
                embed,
            ],
        });
    },
};