const {
    SlashCommandBuilder,
    MessageFlags,
} = require("discord.js");

const {
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    buildAestheticResponse,
} = require("../../components/buttons/aestheticReroll");

const {
    getMoodChoices,
} = require("../../data/moods");

const {
    getDefaultAestheticId,
    getDefaultMoodId,
} = require(
    "../../services/database/guildSettingsService"
);

const {
    getEnabledGuildPacks,
    getEnabledGuildPackById,
    getDefaultGuildPack,
} = require(
    "../../services/database/guildAestheticPackService"
);

const {
    buildSystemEmbed,
} = require(
    "../../components/embeds/systemResponse"
);

module.exports = {
    requireGenerationChannel: true,

    /*
     * Generation is the one thing worth metering per member: every run costs an
     * AI call, and reroll buttons share the same bucket.
     */
    rateLimitScope: "generation",


    data: new SlashCommandBuilder()
        .setName("aesthetic")
        .setDescription(
            "Generates a complete matching Discord aesthetic."
        )
        .addStringOption((option) =>
            option
                .setName("pack")
                .setDescription(
                    "Use an Aesthetic Pack from this server."
                )
                .setRequired(false)
                .setAutocomplete(true)
        )
        .addStringOption((option) =>
            option
                .setName("style")
                .setDescription(
                    "Choose your aesthetic style."
                )
                .setRequired(false)
                .addChoices(
                    ...getAestheticChoices()
                )
        )
        .addStringOption((option) =>
            option
                .setName("color")
                .setDescription(
                    "Optionally filter the aesthetic by color."
                )
                .setRequired(false)
                .addChoices(
                    { name: "Black", value: "black" },
                    { name: "White", value: "white" },
                    { name: "Gray", value: "gray" },
                    { name: "Red", value: "red" },
                    { name: "Orange", value: "orange" },
                    { name: "Yellow", value: "yellow" },
                    { name: "Green", value: "green" },
                    { name: "Teal", value: "teal" },
                    { name: "Blue", value: "blue" },
                    { name: "Indigo", value: "indigo" },
                    { name: "Purple", value: "purple" },
                    { name: "Pink", value: "pink" },
                    { name: "Brown", value: "brown" },
                    { name: "Cream", value: "cream" },
                    { name: "Gold", value: "gold" }
                )
        )
        .addStringOption((option) =>
            option
                .setName("mood")
                .setDescription(
                    "Optionally choose the mood of your aesthetic."
                )
                .setRequired(false)
                .addChoices(
                    ...getMoodChoices()
                )
        )
        .addStringOption((option) =>
            option
                .setName("prompt")
                .setDescription(
                    "Optional inspiration for your bio."
                )
                .setRequired(false)
                .setMaxLength(300)
        ),

    async autocomplete(
        interaction
    ) {
        if (!interaction.guildId) {
            await interaction.respond(
                []
            );

            return;
        }

        const focused =
            interaction.options
                .getFocused()
                .toLowerCase()
                .trim();

        const packs =
            await getEnabledGuildPacks(
                interaction.guildId
            );

        const choices =
            packs
                .filter(
                    (pack) =>
                        !focused ||
                        pack.name
                            .toLowerCase()
                            .includes(
                                focused
                            )
                )
                .slice(
                    0,
                    25
                )
                .map(
                    (pack) => ({
                        name:
                            pack.name,
                        value:
                            pack.id,
                    })
                );

        await interaction.respond(
            choices
        );
    },

    async execute(interaction) {
        await interaction.deferReply();

        const explicitPackId =
            interaction.options.getString(
                "pack"
            );

        let selectedPack =
            null;

        if (
            explicitPackId &&
            interaction.guildId
        ) {
            selectedPack =
                await getEnabledGuildPackById(
                    interaction.guildId,
                    explicitPackId
                );

            if (!selectedPack) {
                await interaction.editReply({
                    embeds: [
                        buildSystemEmbed({
                            title:
                                "Aesthetic Pack Unavailable",

                            description:
                                "That Aesthetic Pack is unavailable, disabled, or no longer exists.",

                            type:
                                "warning",
                        }),
                    ],

                    components: [],
                    files: [],
                });

                return;
            }
        }

        let defaultPack =
            null;

        if (
            !selectedPack &&
            interaction.guildId
        ) {
            defaultPack =
                await getDefaultGuildPack(
                    interaction.guildId
                );
        }

        const pack =
            selectedPack ??
            defaultPack;

        let aestheticId =
            interaction.options.getString(
                "style"
            );

        if (
            !aestheticId &&
            pack?.aestheticId
        ) {
            aestheticId =
                pack.aestheticId;
        }

        if (
            !aestheticId &&
            interaction.guildId
        ) {
            aestheticId =
                await getDefaultAestheticId(
                    interaction.guildId
                );
        }

        if (!aestheticId) {
            await interaction.editReply({
                embeds: [
                    buildSystemEmbed({
                        title:
                            "Aesthetic Required",

                        description:
                            "Choose an aesthetic style, select an Aesthetic Pack, or ask a server manager to configure a default aesthetic.",

                        type:
                            "info",
                    }),
                ],

                components: [],
                files: [],
            });

            return;
        }

        let mood =
            interaction.options.getString(
                "mood"
            );

        if (
            !mood &&
            pack?.moodId
        ) {
            mood =
                pack.moodId;
        }

        if (
            !mood &&
            interaction.guildId
        ) {
            mood =
                await getDefaultMoodId(
                    interaction.guildId
                );
        }

        const color =
            interaction.options.getString(
                "color"
            ) || null;

        const request =
            interaction.options.getString(
                "prompt"
            ) || "";

        const {
            payload,
            locked,
        } =
            await buildAestheticResponse({
                interaction,
                aestheticId,
                color,
                mood,
                request,

                packId:
                    pack?.id ??
                    null,

                packName:
                    pack?.name ??
                    null,

                packColors:
                    pack?.colors ??
                    [],

                packSymbols:
                    pack?.symbols ??
                    [],
            });

        /*
         * This command resolves guild settings before it can pick a set,
         * so the reply is already deferred (and therefore public) by the
         * time a premium lock is known. The upsell is sent as an ephemeral
         * follow-up and the empty "thinking" placeholder is deleted, which
         * leaves the person who triggered it with only the private note.
         */
        if (locked) {
            await interaction.followUp({
                ...payload,
                flags: MessageFlags.Ephemeral,
            });

            /*
             * The person already has their private upsell; a failure to
             * tidy up the placeholder must not turn into an error reply.
             */
            try {
                await interaction.deleteReply();
            } catch {
                await interaction
                    .editReply({
                        content: "—",
                        embeds: [],
                        components: [],
                    })
                    .catch(() => null);
            }

            return;
        }

        await interaction.editReply(
            payload
        );
    },
};
