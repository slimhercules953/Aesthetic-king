const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    generateBio,
} = require("../../services/ai/bioService");

function encodeState(value) {
    return Buffer
        .from(value || "", "utf8")
        .toString("base64url");
}

function decodeState(value) {
    if (!value) {
        return "";
    }

    return Buffer
        .from(value, "base64url")
        .toString("utf8");
}

function buildBioResponse({
    bio,
    aesthetic,
    request,
}) {
    const embedColor =
        parseInt(
            aesthetic.colors[0]
                .replace("#", ""),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `✦ ${aesthetic.name} Bio`
            )
            .setDescription(bio)
            .setColor(embedColor)
            .setFooter({
                text:
                    "Aesthetic King • Bio Generator",
            });

    const encodedPrompt =
        encodeState(request);

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `bio:reroll:${aesthetic.id}:${encodedPrompt}`
                    )
                    .setLabel("New Bio")
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    return {
        embeds: [embed],
        components: [buttons],
    };
}

module.exports = {
    customId: "bio:reroll",

    async execute(interaction) {
        await interaction.deferUpdate();

        const parts =
            interaction.customId.split(":");

        const aestheticId =
            parts[2];

        const encodedPrompt =
            parts.slice(3).join(":");

        const request =
            decodeState(encodedPrompt);

        const {
            bio,
            aesthetic,
        } = await generateBio({
            aestheticId,
            request,
        });

        await interaction.editReply(
            buildBioResponse({
                bio,
                aesthetic,
                request,
            })
        );
    },

    buildBioResponse,
};