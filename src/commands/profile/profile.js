const {
    SlashCommandBuilder,
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
} = require("../../components/embeds/premiumLocked");

const {
    buildProfileResponse,
} = require("../../components/buttons/profileReroll");

module.exports = {
    requireGenerationChannel: true,
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription(
            "Generates a matching aesthetic profile picture and banner."
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const premiumUnlocked =
            await resolvePremiumAssets(
                interaction.user.id
            );

        /*
         * The free pool is only empty when every set is premium, which
         * is the one case that deserves an upsell rather than an error.
         */
        let profileSet;

        try {
            profileSet =
                await getRandomProfileSet(
                    null,
                    premiumUnlocked
                );
        } catch (error) {
            if (!isPremiumOnlyError(error)) {
                throw error;
            }

            await interaction.editReply({
                embeds: [
                    buildPremiumAssetsLockedEmbed(),
                ],
            });

            return;
        }

        await interaction.editReply(
            buildProfileResponse(profileSet)
        );
    },
};