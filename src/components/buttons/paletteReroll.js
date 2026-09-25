const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const {
    generatePalette,
} = require(
    "../../services/colors/paletteService"
);

const {
    renderPalette,
} = require(
    "../../services/rendering/paletteRenderer"
);

const {
    createState,
    getState,
} = require(
    "../../services/interactions/interactionStateService"
);

function buildColorList(
    colors
) {
    return colors
        .map(
            (color, index) =>
                `**${index + 1}.** \`${color}\``
        )
        .join("\n");
}

async function buildPaletteResponse({
    interaction,
    aestheticId,
    moodId = null,
    stateId = null,
}) {
    const {
        colors,
        aesthetic,
        mood,
    } = await generatePalette({
        aestheticId,
        moodId,
    });

    const image =
        await renderPalette({
            colors,
        });

    const attachment =
        new AttachmentBuilder(
            image,
            {
                name:
                    "aesthetic-palette.png",
            }
        );

    let resolvedStateId =
        stateId;

    if (!resolvedStateId) {
        resolvedStateId =
            createState({
                type:
                    "palette",

                userId:
                    interaction.user.id,

                aestheticId,
                moodId,
            });
    }

    const embedColor =
        parseInt(
            colors[0].replace(
                "#",
                ""
            ),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `✦ ${aesthetic.name} Palette`
            )
            .setDescription(
                buildColorList(
                    colors
                )
            )
            .setColor(
                embedColor
            )
            .addFields(
                {
                    name:
                        "Aesthetic",
                    value:
                        aesthetic.name,
                    inline: true,
                },
                {
                    name:
                        "Mood",
                    value:
                        mood
                            ? mood.name
                            : "Any",
                    inline: true,
                }
            )
            .setImage(
                "attachment://aesthetic-palette.png"
            )
            .setFooter({
                text:
                    "Aesthetic King • Controls expire in 5 minutes",
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `palette:reroll:${resolvedStateId}`
                    )
                    .setLabel(
                        "Generate Another"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    return {
        embeds: [
            embed,
        ],

        files: [
            attachment,
        ],

        components: [
            buttons,
        ],
    };
}

async function sendExpiredResponse(
    interaction
) {
    await interaction.reply({
        content:
            "✦ This palette session has expired. Run `/palette` again to generate another palette.",

        flags:
            MessageFlags.Ephemeral,
    });
}

module.exports = {
    customId:
        "palette:reroll",

    async execute(
        interaction
    ) {
        const stateId =
            interaction
                .customId
                .split(":")[2];

        const state =
            getState(
                stateId
            );

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
                    "Only the person who generated this palette can use this control.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferUpdate();

        const {
            aestheticId,
            moodId,
        } = state.data;

        const response =
            await buildPaletteResponse({
                interaction,
                aestheticId,
                moodId,
                stateId,
            });

        await interaction.editReply(
            response
        );
    },

    buildPaletteResponse,
};