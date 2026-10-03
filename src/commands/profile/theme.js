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
    buildPremiumLockedReply,
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
        /*
         * Resolved before deferring so the upsell can be ephemeral — see
         * the note in `profile.js`.
         */
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

            await interaction.reply(
                buildPremiumLockedReply(
                    buildPremiumAssetsLockedEmbed()
                )
            );

            return;
        }

        await interaction.deferReply();

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