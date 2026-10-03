const {
    AttachmentBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

const {
    getAssetBuffer,
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
    pickProfileSet,
} = require("../../services/aesthetics/packSetService");

const {
    getPackColors,
} = require("../../services/aesthetics/packContextService");

const {
    extractColors,
    getMimeTypeFromExtension,
} = require("../../services/colors/colorService");

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

/*
 * The reroll button used to encode the profile set id, which left nowhere to
 * carry the Aesthetic Pack that produced it. It now encodes a short-lived
 * state id so "New Theme" stays inside the same Pack.
 */
async function buildThemeResponse(
    interaction,
    profileSet,
    {
        packName = null,
        packColors = [],
        stateId = null,
    } = {}
) {
    const bannerBuffer =
        await getAssetBuffer(
            profileSet.banner.key
        );

    const bannerColors =
        await extractColors(
            bannerBuffer,
            getMimeTypeFromExtension(
                profileSet.banner.extension
            )
        );

    /*
     * A Pack's curated palette wins over whatever the banner happens to
     * contain, matching how `/aesthetic` treats pack colours. Two is the
     * floor because the embed reports a Primary and Secondary colour.
     */
    const colors =
        packColors.length >= 2
            ? packColors.map((hex) => ({ hex }))
            : bannerColors;

    const previewBuffer =
        await renderProfilePreview({
            pfpUrl:
                profileSet.pfp.url,

            bannerUrl:
                profileSet.banner.url,

            colors,

            username:
                interaction.user.globalName ||
                interaction.user.username,

            bio:
                "building an aesthetic identity ✦",
        });

    const attachment =
        new AttachmentBuilder(
            previewBuffer,
            {
                name: "aesthetic-theme.png",
            }
        );

    const primaryColor =
        parseInt(
            colors[0].hex.replace("#", ""),
            16
        );

    const embed =
        new EmbedBuilder()
            .setTitle(
                "✦ Your Aesthetic Theme"
            )
            .setDescription(
                packName
                    ? `Generated using the **${packName}** Aesthetic Pack.`
                    : "A matching profile picture, banner, and color palette generated for you."
            )
            .setColor(primaryColor)
            .addFields(
                {
                    name: "Profile Set",
                    value: profileSet.id,
                    inline: true,
                },
                {
                    name: "Primary",
                    value: colors[0].hex,
                    inline: true,
                },
                {
                    name: "Secondary",
                    value: colors[1].hex,
                    inline: true,
                },
                {
                    name: "Profile Picture",
                    value:
                        `[Open image](${profileSet.pfp.url})`,
                },
                {
                    name: "Banner",
                    value:
                        `[Open image](${profileSet.banner.url})`,
                }
            )
            .setImage(
                "attachment://aesthetic-theme.png"
            )
            .setFooter({
                text: packName
                    ? `Aesthetic King • ${packName} • Theme Generator`
                    : "Aesthetic King • Theme Generator",
            });

    const buttons =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(
                        stateId
                            ? `theme:reroll:${stateId}`
                            : "theme:reroll:expired"
                    )
                    .setLabel("New Theme")
                    .setStyle(
                        ButtonStyle.Primary
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
                    .setLabel("Banner")
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        profileSet.banner.url
                    )
            );

    return {
        embeds: [embed],
        files: [attachment],
        components: [buttons],
    };
}

/*
 * Split in two because the preview render (banner download, colour
 * extraction, canvas) is slow. Entitlements and the pick happen first —
 * Discord fixes ephemerality when the reply is created, so a premium-only
 * match must be known before anything is deferred — and the render happens
 * afterwards, while the "thinking" state covers it.
 */
async function prepareTheme({
    interaction,
    filters = {},
    pack = null,
    excludeSetId = null,
    stateId = null,
}) {
    const premiumUnlocked =
        await resolvePremiumAssets(
            interaction.user.id
        );

    let profileSet;

    try {
        profileSet = await pickProfileSet(
            {
                ...filters,
                premiumUnlocked,
            },
            excludeSetId
        );
    } catch (error) {
        if (!isPremiumOnlyError(error)) {
            throw error;
        }

        return {
            locked: true,
            payload: buildPremiumLockedReply(
                buildPremiumAssetsLockedEmbed()
            ),
        };
    }

    const packColors = getPackColors(pack);
    const packName = pack?.name ?? null;

    const resolvedStateId =
        stateId ??
        createState({
            type: "theme",
            userId: interaction.user.id,
            guildId: interaction.guildId,
            aestheticId: filters.aestheticId ?? null,
            moodId: filters.moodId ?? null,
            packName,
            packColors,
            profileSetId: profileSet.id,
        });

    return {
        locked: false,
        profileSet,
        stateId: resolvedStateId,
        packName,
        packColors,
    };
}

async function sendExpiredResponse(interaction) {
    await interaction.reply({
        content:
            "✦ This theme session has expired. Run `/theme` again to generate another preview.",

        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    customId: "theme:reroll",

    async execute(interaction) {
        const stateId =
            interaction.customId.split(":")[2];

        const state = getState(stateId);

        if (!state) {
            await sendExpiredResponse(interaction);
            return;
        }

        if (
            state.data.userId !==
            interaction.user.id
        ) {
            await interaction.reply({
                content:
                    "Only the person who generated this theme can use this control.",

                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        const {
            aestheticId,
            moodId,
            packName,
            packColors,
            profileSetId,
        } = state.data;

        /*
         * The reroll only needs the Pack's display name and colours, both of
         * which were stored when the theme was first generated, so the Pack
         * row itself is not re-read.
         */
        const result = await prepareTheme({
            interaction,
            filters: { aestheticId, moodId },
            pack: {
                name: packName ?? null,
                colors: packColors ?? [],
            },
            excludeSetId: profileSetId ?? null,
            stateId,
        });

        if (result.locked) {
            await interaction.reply(result.payload);
            return;
        }

        updateState(stateId, {
            profileSetId: result.profileSet.id,
        });

        await interaction.deferUpdate();

        await interaction.editReply(
            await buildThemeResponse(
                interaction,
                result.profileSet,
                {
                    packName: result.packName,
                    packColors: result.packColors,
                    stateId,
                }
            )
        );
    },

    prepareTheme,
    buildThemeResponse,
};
