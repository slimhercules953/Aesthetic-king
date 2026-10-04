const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const {
    generateStatuses,
} = require("../../services/ai/statusService");

const {
    createState,
    getState,
} = require(
    "../../services/interactions/interactionStateService"
);

function buildStatusList(statuses) {
    return statuses
        .map(
            (status, index) =>
                `**${index + 1}.** ${status}`
        )
        .join("\n\n");
}

async function buildStatusResponse({
    interaction,
    aestheticId,
    moodId = null,
    request = "",
    pack = null,
    stateId = null,
}) {
    const {
        statuses,
        aesthetic,
        mood,
    } = await generateStatuses({
        aestheticId,
        moodId,
        request,
        pack,
    });

    let resolvedStateId =
        stateId;

    if (!resolvedStateId) {
        resolvedStateId =
            createState({
                type: "status",
                userId:
                    interaction.user.id,
                aestheticId,
                moodId,
                request,
                pack,
            });
    }

    const packName = pack?.name ?? null;

    const embedColor =
        parseInt(
            aesthetic.colors[0]
                .replace("#", ""),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `✦ ${aesthetic.name} Status Ideas`
            )
            .setDescription(
                buildStatusList(
                    statuses
                )
            )
            .setColor(
                embedColor
            )
            .addFields(
                {
                    name: "Aesthetic",
                    value:
                        aesthetic.name,
                    inline: true,
                },
                {
                    name: "Mood",
                    value:
                        mood
                            ? mood.name
                            : "Any",
                    inline: true,
                },
                ...(
                    packName
                        ? [
                              {
                                  name:
                                      "Aesthetic Pack",
                                  value:
                                      `✦ ${packName}`,
                                  inline: true,
                              },
                          ]
                        : []
                )
            )
            .setFooter({
                text: packName
                    ? `Aesthetic King • ${packName} • Controls expire in 5 minutes`
                    : "Aesthetic King • Controls expire in 5 minutes",
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `status:reroll:${resolvedStateId}`
                    )
                    .setLabel(
                        "Generate More"
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
            "✦ This status session has expired. Run `/status` again to generate more ideas.",

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

    customId:
        "status:reroll",

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
                    "Only the person who generated these statuses can use this control.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferUpdate();

        const {
            aestheticId,
            moodId,
            request,
            pack,
        } = state.data;

        const response =
            await buildStatusResponse({
                interaction,
                aestheticId,
                moodId,
                request,
                pack,
                stateId,
            });

        await interaction.editReply(
            response
        );
    },

    buildStatusResponse,
};