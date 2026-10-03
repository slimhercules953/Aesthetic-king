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
        /*
         * The entitlement check and the pick both run before the reply is
         * deferred. Discord decides ephemerality when the response is sent,
         * so a public defer would lock the upsell into the channel. Both
         * lookups are in-memory / pooled and measured at ~1ms, so the
         * three-second interaction window is not at risk.
         */
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

            await interaction.reply(
                buildPremiumLockedReply(
                    buildPremiumAssetsLockedEmbed()
                )
            );

            return;
        }

        await interaction.deferReply();

        await interaction.editReply(
            buildProfileResponse(profileSet)
        );
    },
};