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
    buildThemeResponse,
} = require("../../components/buttons/themeReroll");

module.exports = {
    requireGenerationChannel: true,
    data: new SlashCommandBuilder()
        .setName("theme")
        .setDescription(
            "Generates a complete aesthetic Discord profile preview."
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const premiumUnlocked =
            await resolvePremiumAssets(
                interaction.user.id
            );

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

        const response =
            await buildThemeResponse(
                interaction,
                profileSet
            );

        await interaction.editReply(
            response
        );
    },
};