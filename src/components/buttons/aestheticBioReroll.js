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

        const colorState =
            parts[3];

        const setId =
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

        const matchingSets =
            await getMatchingProfileSets({
                aestheticId,
                color,
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
                color,
                request,
                fixedProfileSet:
                    profileSet,
            });

        await interaction.editReply(
            payload
        );
    },
};