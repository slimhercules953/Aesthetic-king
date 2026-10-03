const {
    MessageFlags,
} = require("discord.js");

const {
    getMatchingProfileSets,
} = require(
    "../../services/aesthetics/aestheticService"
);

const {
    getState,
} = require(
    "../../services/interactions/interactionStateService"
);

const {
    resolvePremiumAssets,
} = require(
    "../../services/entitlements/featureAccessService"
);

const {
    buildAestheticResponse,
    sendExpiredResponse,
} = require("./aestheticReroll");

module.exports = {
    customId: "aesthetic:bio",

    async execute(interaction) {
        const parts =
            interaction.customId.split(
                ":"
            );

        const stateId =
            parts[2];

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
                    "Only the person who generated this aesthetic can use these controls.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferUpdate();

        const {
            aestheticId,
            color,
            mood,
            request,
            profileSetId,
            username,
            status,
        } = state.data;

        const premiumUnlocked =
            await resolvePremiumAssets(
                interaction.user.id
            );

        /*
         * Re-finding the set the user already has, through the same
         * premium filter the original pick used. If the unlock lapsed
         * since the message was posted, the set is gone from the pool
         * and the existing "no longer available" reply applies — a
         * reroll must not resurrect content the user can no longer use.
         */
        const matchingSets =
            await getMatchingProfileSets({
                aestheticId,
                color,
                mood,
                premiumUnlocked,
            });

        const profileSet =
            matchingSets.find(
                (set) =>
                    set.id ===
                    profileSetId
            );

        if (!profileSet) {
            await interaction.followUp({
                content:
                    "That profile set is no longer available. Run `/aesthetic` again.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        const {
            payload,
        } =
            await buildAestheticResponse({
                interaction,
                aestheticId,
                color,
                mood,
                request,

                fixedProfileSet:
                    profileSet,

                premiumUnlocked,

                fixedUsername:
                    username,

                fixedStatus:
                    status,

                stateId,
            });

        await interaction.editReply(
            payload
        );
    },
};