const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const {
    getRandomMatchingProfileSet,
} = require("../../services/aesthetics/aestheticService");

const {
    getAssetBuffer,
} = require("../../services/assets/assetService");

const {
    extractColors,
    getMimeTypeFromExtension,
} = require("../../services/colors/colorService");

const {
    generateBio,
} = require("../../services/ai/bioService");

const {
    renderProfilePreview,
} = require("../../services/rendering/profileRenderer");

const {
    createState,
    getState,
    updateState,
} = require(
    "../../services/interactions/interactionStateService"
);

const {
    generateStatuses,
} = require("../../services/ai/statusService");

const {
    generateUsernames,
} = require("../../services/ai/usernameService");

const {
    getAesthetic,
} = require("../../data/aesthetics");

function formatFilterName(value) {
    if (!value) {
        return null;
    }

    return (
        value.charAt(0).toUpperCase() +
        value.slice(1)
    );
}

async function buildAestheticResponse({
    interaction,
    aestheticId,
    color = null,
    mood = null,
    request = "",
    excludeSetId = null,
    fixedProfileSet = null,
    stateId = null,
    fixedUsername = null,
    fixedStatus = null,
}) {
    let profileSet;

    try {
        profileSet =
            fixedProfileSet ||
            await getRandomMatchingProfileSet(
                {
                    aestheticId,
                    color,
                    mood,
                },
                excludeSetId
            );
    } catch (error) {
        if (
            error.message ===
            "No profile sets match the requested aesthetic filters."
        ) {
            const aesthetic =
                getAesthetic(aestheticId);

            const aestheticName =
                aesthetic?.name ||
                formatFilterName(
                    aestheticId
                );

            const activeFilters = [
                aestheticName,
                formatFilterName(color),
                formatFilterName(mood),
            ].filter(Boolean);

            const filterDisplay =
                activeFilters.join(" • ");

            const optionalFilters = [
                color && "color",
                mood && "mood",
            ].filter(Boolean);

            let suggestion;

            if (
                optionalFilters.length ===
                2
            ) {
                suggestion =
                    "Try removing the color or mood filter to broaden your results.";
            } else if (
                optionalFilters.length ===
                1
            ) {
                suggestion =
                    `Try removing the ${optionalFilters[0]} filter to broaden your results.`;
            } else {
                suggestion =
                    "There are currently no profile sets available for this aesthetic.";
            }

            const description =
                `No profile sets currently match:\n` +
                `**${filterDisplay}**\n\n` +
                suggestion;

            const embed =
                new EmbedBuilder()
                    .setTitle(
                        "✦ No Matching Aesthetic Found"
                    )
                    .setDescription(
                        description
                    )
                    .setColor(
                        0x5865F2
                    )
                    .setFooter({
                        text:
                            "Aesthetic King • Asset Library",
                    });

            return {
                payload: {
                    embeds: [embed],
                    components: [],
                    files: [],
                },

                profileSet: null,
                stateId: null,
            };
        }

        throw error;
    }

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

    const {
        bio,
        aesthetic,
    } = await generateBio({
        aestheticId,
        request,
    });
    let username =
        fixedUsername;

    if (!username) {
        const usernameResult =
            await generateUsernames({
                aestheticId,
                moodId: mood,
                request,
            });

        username =
            usernameResult.usernames[0];
    }

    let status =
        fixedStatus;

    if (!status) {
        const statusResult =
            await generateStatuses({
                aestheticId,
                moodId: mood,
                request,
            });

        status =
            statusResult.statuses[0];
    }
    const previewBuffer =
        await renderProfilePreview({
            pfpUrl:
                profileSet.pfp.url,
            bannerUrl:
                profileSet.banner.url,

            colors,
            username,
            bio,
        });

    const attachment =
        new AttachmentBuilder(
            previewBuffer,
            {
                name:
                    "aesthetic-profile.png",
            }
        );

    const embedColor =
        parseInt(
            colors[0].hex.replace(
                "#",
                ""
            ),
            16
        );

    let resolvedStateId =
        stateId;

    if (!resolvedStateId) {
        resolvedStateId =
            createState({
                userId:
                    interaction.user.id,

                aestheticId,
                color,
                mood,
                request,

                profileSetId:
                    profileSet.id,

                username,
                bio,
                status,
            });
    } else {
        updateState(
            resolvedStateId,
            {
                profileSetId:
                    profileSet.id,

                username,
                bio,
                status,
            }
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                `✦ ${aesthetic.name} Aesthetic`
            )
            .setDescription(
                "A complete matching Discord aesthetic generated for you."
            )
            .setColor(
                embedColor
            )
            .addFields(
                {
                    name: "Username",
                    value: `\`${username}\``,
                },
                {
                    name: "Bio",
                    value: bio,
                },
                {
                    name: "Status",
                    value: status,
                },
                {
                    name: "Palette",
                    value:
                        `${colors[0].hex}  •  ${colors[1].hex}`,
                    inline: true,
                },
                {
                    name: "Symbols",
                    value:
                        aesthetic.symbols.join(
                            "  "
                        ),
                    inline: true,
                },
                {
                    name: "Color Filter",
                    value:
                        color
                            ? formatFilterName(
                                color
                            )
                            : "Any",
                    inline: true,
                },
                {
                    name: "Mood",
                    value:
                        mood
                            ? formatFilterName(
                                mood
                            )
                            : "Any",
                    inline: true,
                },
                {
                    name: "Profile Picture",
                    value:
                        `[Open image](${profileSet.pfp.url})`,
                    inline: true,
                },
                {
                    name: "Banner",
                    value:
                        `[Open image](${profileSet.banner.url})`,
                    inline: true,
                }
            )
            .setImage(
                "attachment://aesthetic-profile.png"
            )
            .setFooter({
                text:
                    `Aesthetic King • Set ${profileSet.id} • Controls expire in 5 minutes`,
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:reroll:${resolvedStateId}`
                    )
                    .setLabel(
                        "New Aesthetic"
                    )
                    .setStyle(
                        ButtonStyle.Primary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:bio:${resolvedStateId}`
                    )
                    .setLabel(
                        "New Bio"
                    )
                    .setStyle(
                        ButtonStyle.Secondary
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
                    .setLabel(
                        "Banner"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        profileSet.banner.url
                    ),
                    new ButtonBuilder()
                    .setCustomId(
                        `aesthetic:save:${resolvedStateId}`
                    )
                    .setLabel(
                        "Save Aesthetic"
                    )
                    .setStyle(
                        ButtonStyle.Success
                    ),
            );

    return {
        payload: {
            embeds: [embed],
            files: [
                attachment,
            ],
            components: [
                buttons,
            ],
        },

        profileSet,

        stateId:
            resolvedStateId,
    };
}

async function sendExpiredResponse(
    interaction
) {
    await interaction.reply({
        content:
            "✦ This aesthetic session has expired. Run `/aesthetic` again to create a new one.",

        flags:
            MessageFlags.Ephemeral,
    });
}

module.exports = {
    customId:
        "aesthetic:reroll",

    async execute(
        interaction
    ) {
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
        } = state.data;

        const {
            payload,
        } =
            await buildAestheticResponse({
                interaction,
                aestheticId,
                color,
                mood,
                request,

                excludeSetId:
                    profileSetId,

                stateId,
            });

        await interaction.editReply(
            payload
        );
    },

    buildAestheticResponse,
    sendExpiredResponse,
};