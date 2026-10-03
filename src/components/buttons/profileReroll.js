const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getRandomProfileSet,
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

function buildProfileResponse(profileSet) {
    const embed = new EmbedBuilder()
        .setTitle("✦ Your Aesthetic Profile")
        .setDescription(
            "A matching profile picture and banner set selected for you."
        )
        .setThumbnail(profileSet.pfp.url)
        .setImage(profileSet.banner.url)
        .addFields(
            {
                name: "Profile Picture",
                value: `[Open image](${profileSet.pfp.url})`,
            },
            {
                name: "Banner",
                value: `[Open image](${profileSet.banner.url})`,
            }
        )
        .setFooter({
            text: `Profile Set ${profileSet.id}`,
        });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`profile:reroll:${profileSet.id}`)
                .setLabel("New Profile")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setLabel("Profile Picture")
                .setStyle(ButtonStyle.Link)
                .setURL(profileSet.pfp.url),

            new ButtonBuilder()
                .setLabel("Banner")
                .setStyle(ButtonStyle.Link)
                .setURL(profileSet.banner.url)
        );

    return {
        embeds: [embed],
        components: [buttons],
    };
}

module.exports = {
    customId: "profile:reroll",

    async execute(interaction) {
        const parts = interaction.customId.split(":");

        const currentSetId = parts[2] || null;

        /*
         * The entitlement check and pick happen before the interaction is
         * acknowledged, so a locked reroll can be answered ephemerally.
         * Replying privately also leaves the original public message (and
         * its working button) alone instead of replacing it with an upsell.
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

        await interaction.editReply(
            buildProfileResponse(profileSet)
        );
    },

    buildProfileResponse,
};