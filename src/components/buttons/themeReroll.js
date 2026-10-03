const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getRandomProfileSet,
    getAssetBuffer,
} = require("../../services/assets/assetService");

const {
    isPremiumOnlyError,
} = require("../../services/assets/premiumSets");

const {
    resolvePremiumAssets,
} = require("../../services/entitlements/featureAccessService");

const {
    buildPremiumAssetsLockedEmbed,
    buildPremiumLockedReply,
} = require("../../components/embeds/premiumLocked");

const {
    extractColors,
    getMimeTypeFromExtension,
} = require("../../services/colors/colorService");

const {
    renderProfilePreview,
} = require("../../services/rendering/profileRenderer");

async function buildThemeResponse(
    interaction,
    profileSet
) {
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

    const previewBuffer =
        await renderProfilePreview({
            pfpUrl:
                profileSet.pfp.url,

            bannerUrl:
                profileSet.banner.url,

            colors,

            username:
                interaction.user.globalName ||
                interaction.user.username,

            bio:
                "building an aesthetic identity ✦",
        });

    const attachment =
        new AttachmentBuilder(
            previewBuffer,
            {
                name: "aesthetic-theme.png",
            }
        );

    const primaryColor =
        parseInt(
            colors[0].hex.replace("#", ""),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "✦ Your Aesthetic Theme"
            )
            .setDescription(
                "A matching profile picture, banner, and color palette generated for you."
            )
            .setColor(primaryColor)
            .addFields(
                {
                    name: "Profile Set",
                    value: profileSet.id,
                    inline: true,
                },
                {
                    name: "Primary",
                    value: colors[0].hex,
                    inline: true,
                },
                {
                    name: "Secondary",
                    value: colors[1].hex,
                    inline: true,
                },
                {
                    name: "Profile Picture",
                    value:
                        `[Open image](${profileSet.pfp.url})`,
                },
                {
                    name: "Banner",
                    value:
                        `[Open image](${profileSet.banner.url})`,
                }
            )
            .setImage(
                "attachment://aesthetic-theme.png"
            )
            .setFooter({
                text:
                    "Aesthetic King • Theme Generator",
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `theme:reroll:${profileSet.id}`
                    )
                    .setLabel("New Theme")
                    .setStyle(
                        ButtonStyle.Primary
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
        embeds: [embed],
        files: [attachment],
        components: [buttons],
    };
}

module.exports = {
    customId: "theme:reroll",

    async execute(interaction) {
        const parts =
            interaction.customId.split(":");

        const currentSetId =
            parts[2] || null;

        /*
         * Resolved before acknowledging the button so the upsell can be
         * ephemeral. Replying privately also leaves the original preview
         * and its reroll button untouched.
         */
        const premiumUnlocked =
            await resolvePremiumAssets(
                interaction.user.id
            );

        let profileSet;

        try {
            profileSet =
                await getRandomProfileSet(
                    currentSetId,
                    premiumUnlocked
                );
        } catch (error) {
            if (!isPremiumOnlyError(error)) {
                throw error;
            }

            await interaction.reply(
                buildPremiumLockedReply(
                    buildPremiumAssetsLockedEmbed()
                )
            );

            return;
        }

        await interaction.deferUpdate();

        const response =
            await buildThemeResponse(
                interaction,
                profileSet
            );

        await interaction.editReply(
            response
        );
    },

    buildThemeResponse,
};