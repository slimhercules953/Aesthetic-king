const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getRandomMatchingProfileSet,
} = require("../../services/aesthetics/aestheticService");

const {
    getAssetBuffer,
} = require("../../services/assets/assetService");

const {
    extractColors,
    getMimeTypeFromExtension,
} = require("../../services/colors/colorService");

const {
    generateBio,
} = require("../../services/ai/bioService");

const {
    renderProfilePreview,
} = require("../../services/rendering/profileRenderer");

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

async function buildAestheticResponse({
    interaction,
    aestheticId,
    request = "",
    excludeSetId = null,
    fixedProfileSet = null,
}) {
    const profileSet =
        fixedProfileSet ||
        await getRandomMatchingProfileSet(
            {
                aestheticId,
            },
            excludeSetId
        );

    const bannerBuffer =
        await getAssetBuffer(
            profileSet.banner.key
        );

    const colors =
        await extractColors(
            bannerBuffer,
            getMimeTypeFromExtension(
                profileSet.banner.extension
            )
        );

    const {
        bio,
        aesthetic,
    } = await generateBio({
        aestheticId,
        request,
    });

    const previewBuffer =
        await renderProfilePreview({
            pfpUrl: profileSet.pfp.url,
            bannerUrl: profileSet.banner.url,
            colors,
            username:
                interaction.user.globalName ||
                interaction.user.username,
            bio,
        });

    const attachment =
        new AttachmentBuilder(
            previewBuffer,
            {
                name:
                    "aesthetic-profile.png",
            }
        );

    const embedColor =
        parseInt(
            colors[0].hex.replace(
                "#",
                ""
            ),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                `✦ ${aesthetic.name} Aesthetic`
            )
            .setDescription(
                "A complete matching Discord aesthetic generated for you."
            )
            .setColor(embedColor)
            .addFields(
                {
                    name: "Bio",
                    value: bio,
                },
                {
                    name: "Palette",
                    value:
                        `${colors[0].hex}  •  ${colors[1].hex}`,
                    inline: true,
                },
                {
                    name: "Symbols",
                    value:
                        aesthetic.symbols.join(
                            "  "
                        ),
                    inline: true,
                },
                {
                    name: "Profile Picture",
                    value:
                        `[Open image](${profileSet.pfp.url})`,
                    inline: true,
                },
                {
                    name: "Banner",
                    value:
                        `[Open image](${profileSet.banner.url})`,
                    inline: true,
                }
            )
            .setImage(
                "attachment://aesthetic-profile.png"
            )
            .setFooter({
                text:
                    `Aesthetic King • Set ${profileSet.id}`,
            });

    const encodedPrompt =
        encodeState(request);

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:reroll:${aestheticId}:${profileSet.id}:${encodedPrompt}`
                    )
                    .setLabel(
                        "New Aesthetic"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:bio:${aestheticId}:${profileSet.id}:${encodedPrompt}`
                    )
                    .setLabel(
                        "New Bio"
                    )
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setLabel(
                        "Profile Picture"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        profileSet.pfp.url
                    ),

                new ButtonBuilder()
                    .setLabel(
                        "Banner"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        profileSet.banner.url
                    )
            );

    return {
        payload: {
            embeds: [embed],
            files: [attachment],
            components: [buttons],
        },

        profileSet,
    };
}

module.exports = {
    customId: "aesthetic:reroll",

    async execute(interaction) {
        await interaction.deferUpdate();

        const parts =
            interaction.customId.split(
                ":"
            );

        const aestheticId =
            parts[2];

        const currentSetId =
            parts[3];

        const encodedPrompt =
            parts.slice(4).join(":");

        const request =
            decodeState(
                encodedPrompt
            );

        const {
            payload,
        } =
            await buildAestheticResponse({
                interaction,
                aestheticId,
                request,
                excludeSetId:
                    currentSetId,
            });

        await interaction.editReply(
            payload
        );
    },

    buildAestheticResponse,
    decodeState,
};