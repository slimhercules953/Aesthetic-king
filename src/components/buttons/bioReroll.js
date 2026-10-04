const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const {
    generateBio,
} = require("../../services/ai/bioService");

const {
    createState,
    getState,
} = require(
    "../../services/interactions/interactionStateService"
);

function buildBioEmbed({
    bio,
    aesthetic,
}) {
    const embedColor =
        parseInt(
            aesthetic.colors[0]
                .replace("#", ""),
            16
        );

    return new EmbedBuilder()
        .setTitle(
            `✦ ${aesthetic.name} Bio`
        )
        .setDescription(bio)
        .setColor(embedColor)
        .setFooter({
            text:
                "Aesthetic King • Controls expire in 5 minutes",
        });
}

async function buildBioResponse({
    interaction,
    aestheticId,
    request = "",
    pack = null,
    stateId = null,
}) {
    const {
        bio,
        aesthetic,
    } = await generateBio({
        aestheticId,
        request,
        pack,
    });

    let resolvedStateId =
        stateId;

    if (!resolvedStateId) {
        resolvedStateId =
            createState({
                type: "bio",

                userId:
                    interaction.user.id,

                aestheticId,
                request,

                /*
                 * The Pack lives in the server's Studio settings, so a reroll
                 * minutes later could otherwise pick up an edit (or a deletion)
                 * and quietly change the style of the bio being refreshed.
                 * Carrying the snapshot keeps a reroll consistent with the
                 * original.
                 */
                pack,
            });
    }

    const embed =
        buildBioEmbed({
            bio,
            aesthetic,
        });

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `bio:reroll:${resolvedStateId}`
                    )
                    .setLabel(
                        "New Bio"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    return {
        embeds: [embed],
        components: [buttons],
    };
}

async function sendExpiredResponse(
    interaction
) {
    await interaction.reply({
        content:
            "✦ This bio session has expired. Run `/bio` again to generate another bio.",

        flags:
            MessageFlags.Ephemeral,
    });
}

module.exports = {
    /*
     * A reroll is a fresh AI call, so it shares the member's generation
     * bucket with the command that made the embed.
     */
    rateLimitScope: "generation",

    customId: "bio:reroll",

    async execute(interaction) {
        const stateId =
            interaction.customId
                .split(":")[2];

        const state =
            getState(stateId);

        if (!state) {
            await sendExpiredResponse(
                interaction
            );

            return;
        }

        if (
            state.data.userId !==
            interaction.user.id
        ) {
            await interaction.reply({
                content:
                    "Only the person who generated this bio can use this control.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferUpdate();

        const {
            aestheticId,
            request,
            pack,
        } = state.data;

        const response =
            await buildBioResponse({
                interaction,
                aestheticId,
                request,
                pack: pack ?? null,
                stateId,
            });

        await interaction.editReply(
            response
        );
    },

    buildBioResponse,
};