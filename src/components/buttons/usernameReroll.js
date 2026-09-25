const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const {
    generateUsernames,
} = require("../../services/ai/usernameService");

const {
    createState,
    getState,
} = require(
    "../../services/interactions/interactionStateService"
);

function buildUsernameList(
    usernames
) {
    return usernames
        .map(
            (username, index) =>
                `**${index + 1}.** \`${username}\``
        )
        .join("\n");
}

async function buildUsernameResponse({
    interaction,
    aestheticId,
    moodId = null,
    request = "",
    stateId = null,
}) {
    const {
        usernames,
        aesthetic,
        mood,
    } = await generateUsernames({
        aestheticId,
        moodId,
        request,
    });

    let resolvedStateId =
        stateId;

    if (!resolvedStateId) {
        resolvedStateId =
            createState({
                type: "username",

                userId:
                    interaction.user.id,

                aestheticId,
                moodId,
                request,
            });
    }

    const embedColor =
        parseInt(
            aesthetic.colors[0]
                .replace("#", ""),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `✦ ${aesthetic.name} Username Ideas`
            )
            .setDescription(
                buildUsernameList(
                    usernames
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
                }
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
                        `username:reroll:${resolvedStateId}`
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
            "✦ This username session has expired. Run `/username` again to generate more ideas.",

        flags:
            MessageFlags.Ephemeral,
    });
}

module.exports = {
    customId:
        "username:reroll",

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
                    "Only the person who generated these usernames can use this control.",

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
        } = state.data;

        const response =
            await buildUsernameResponse({
                interaction,
                aestheticId,
                moodId,
                request,
                stateId,
            });

        await interaction.editReply(
            response
        );
    },

    buildUsernameResponse,
};