const {
    getMatchingProfileSets,
} = require("../../services/aesthetics/aestheticService");

const {
    buildAestheticResponse,
    decodeState,
} = require("./aestheticReroll");

module.exports = {
    customId: "aesthetic:bio",

    async execute(interaction) {
        await interaction.deferUpdate();

        const parts =
            interaction.customId.split(
                ":"
            );

        const aestheticId =
            parts[2];

        const setId =
            parts[3];

        const encodedPrompt =
            parts.slice(4).join(":");

        const request =
            decodeState(
                encodedPrompt
            );

        const matchingSets =
            await getMatchingProfileSets({
                aestheticId,
            });

        const profileSet =
            matchingSets.find(
                (set) =>
                    set.id === setId
            );

        if (!profileSet) {
            throw new Error(
                `Profile set ${setId} is no longer available for ${aestheticId}.`
            );
        }

        const {
            payload,
        } =
            await buildAestheticResponse({
                interaction,
                aestheticId,
                request,
                fixedProfileSet:
                    profileSet,
            });

        await interaction.editReply(
            payload
        );
    },
};