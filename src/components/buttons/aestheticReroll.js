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
    color = null,
    request = "",
    excludeSetId = null,
    fixedProfileSet = null,
}) {
    let profileSet;

    try {
        profileSet =
            fixedProfileSet ||
            await getRandomMatchingProfileSet(
                {
                    aestheticId,
                    color,
                },
                excludeSetId
            );
    } catch (error) {
        if (
            error.message ===
            "No profile sets match the requested aesthetic filters."
        ) {
            const {
                getAesthetic,
            } = require("../../data/aesthetics");

            const aesthetic =
                getAesthetic(aestheticId);

            const aestheticName =
                aesthetic?.name ||
                aestheticId;

            const colorName =
                color
                    ? color.charAt(0).toUpperCase() +
                    color.slice(1)
                    : null;

            const description =
                colorName
                    ? `No **${aestheticName} + ${colorName}** profile sets are available yet.\n\nTry another color or generate **${aestheticName}** without a color filter.`
                    : `No **${aestheticName}** profile sets are available yet.`;

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "✦ No Matching Aesthetic Found"
                    )
                    .setDescription(
                        description
                    )
                    .setColor(
                        0x5865F2
                    )
                    .setFooter({
                        text:
                            "Aesthetic King • Asset Library",
                    });

            return {
                payload: {
                    embeds: [embed],
                    components: [],
                    files: [],
                },

                profileSet: null,
            };
        }

        throw error;
    }

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
                name: "aesthetic-profile.png",
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
                    name: "Color Filter",
                    value:
                        color
                            ? color
                                .charAt(0)
                                .toUpperCase() +
                            color.slice(1)
                            : "Any",
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

    const colorState =
        color || "any";

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:reroll:${aestheticId}:${colorState}:${profileSet.id}:${encodedPrompt}`
                    )
                    .setLabel(
                        "New Aesthetic"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:bio:${aestheticId}:${colorState}:${profileSet.id}:${encodedPrompt}`
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
                    .setLabel("Banner")
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

        const colorState =
            parts[3];

        const currentSetId =
            parts[4];

        const encodedPrompt =
            parts.slice(5).join(":");

        const color =
            colorState === "any"
                ? null
                : colorState;

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
                color,
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