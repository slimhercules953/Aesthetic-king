const {
    MessageFlags,
} = require("discord.js");

const {
    getState,
} = require(
    "../../services/interactions/interactionStateService"
);

const {
    getOrCreateUser,
} = require(
    "../../services/database/userService"
);

const {
    createSavedAesthetic,
    getSavedAestheticByGenerationId,
} = require(
    "../../services/database/savedAestheticService"
);

function formatName(value) {
    if (!value) {
        return null;
    }

    return (
        value.charAt(0).toUpperCase() +
        value.slice(1)
    );
}

module.exports = {
    customId: "aesthetic:save",

    async execute(interaction) {
        const stateId =
            interaction.customId
                .split(":")[2];

        const state =
            getState(stateId);

        if (!state) {
            await interaction.reply({
                content:
                    "✦ This aesthetic session has expired. Run `/aesthetic` again to generate a new one.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        if (
            state.data.userId !==
            interaction.user.id
        ) {
            await interaction.reply({
                content:
                    "Only the person who generated this aesthetic can save it.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        const {
            generationId,
            aestheticId,
            color,
            mood,
            resolvedColor,
            resolvedMood,
            profileSetId,
            username,
            bio,
            status,
            palette = [],
            symbols = [],
        } = state.data;

        /*
         * The resolved pair is what the profile actually looks like;
         * the raw filters are null whenever the user left the options
         * out. Fall back to the filters for sessions created before the
         * resolved values were recorded.
         */
        const savedColor =
            resolvedColor ?? color ?? null;

        const savedMood =
            resolvedMood ?? mood ?? null;

        const existing =
            await getSavedAestheticByGenerationId(
                generationId
            );

        if (existing) {
            await interaction.reply({
                content:
                    "✦ This aesthetic is already saved.",

                flags:
                    MessageFlags.Ephemeral,
            });

            return;
        }

        const user =
            await getOrCreateUser(
                interaction.user
            );

        const nameParts = [
            formatName(
                aestheticId
            ),

            formatName(
                savedColor
            ),

            formatName(
                savedMood
            ),
        ].filter(Boolean);

        const name =
            nameParts.join(
                " • "
            ) ||
            "Saved Aesthetic";

        try {
            await createSavedAesthetic({
                userId:
                    user.id,

                generationId,

                name,

                aestheticId,

                moodId:
                    savedMood,

                colorFilter:
                    savedColor,

                profileSetId,

                usernameIdea:
                    username,

                bio,
                status,
                symbols,
                palette,
            });
        } catch (error) {
            if (
                error.code ===
                "P2002"
            ) {
                await interaction.reply({
                    content:
                        "✦ This aesthetic is already saved.",

                    flags:
                        MessageFlags.Ephemeral,
                });

                return;
            }

            throw error;
        }

        await interaction.reply({
            content:
                `✦ **${name}** has been saved to your Aesthetic King collection.`,

            flags:
                MessageFlags.Ephemeral,
        });
    },
};