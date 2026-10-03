const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require("discord.js");

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
    createState,
    getState,
    updateState,
} = require(
    "../../services/interactions/interactionStateService"
);

/*
 * The reroll button used to encode the profile set id directly, which left
 * nowhere to carry the Aesthetic Pack, style, or mood that produced it — so
 * "New Profile" always widened back to the whole library. It now encodes a
 * short-lived state id, matching how `/aesthetic` and `/palette` work.
 */
function buildProfileEmbed(profileSet, packName = null) {
    return new EmbedBuilder()
        .setTitle("✦ Your Aesthetic Profile")
        .setDescription(
            packName
                ? `Selected using the **${packName}** Aesthetic Pack.`
                : "A matching profile picture and banner set selected for you."
        )
        .setThumbnail(profileSet.pfp.url)
        .setImage(profileSet.banner.url)
        .addFields(
            {
                name: "Profile Picture",
                value: `[Open image](${profileSet.pfp.url})`,
            },
            {
                name: "Banner",
                value: `[Open image](${profileSet.banner.url})`,
            }
        )
        .setFooter({
            text: packName
                ? `Aesthetic King • ${packName} • Set ${profileSet.id}`
                : `Profile Set ${profileSet.id}`,
        });
}

function buildProfileResponse(
    profileSet,
    packName = null,
    stateId = null
) {
    const embed = buildProfileEmbed(
        profileSet,
        packName
    );

    if (!stateId) {
        return {
            embeds: [embed],
            components: [],
        };
    }

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(
                    `profile:reroll:${stateId}`
                )
                .setLabel("New Profile")
                .setStyle(ButtonStyle.Primary),

            new ButtonBuilder()
                .setLabel("Profile Picture")
                .setStyle(ButtonStyle.Link)
                .setURL(profileSet.pfp.url),

            new ButtonBuilder()
                .setLabel("Banner")
                .setStyle(ButtonStyle.Link)
                .setURL(profileSet.banner.url)
        );

    return {
        embeds: [embed],
        components: [buttons],
    };
}

/*
 * Shared by `/profile` and the reroll button. Entitlements resolve before
 * any reply is sent because Discord fixes ephemerality when the response is
 * created — a public defer would lock the upsell into the channel.
 */
async function generateProfile({
    interaction,
    filters = {},
    packName = null,
    excludeSetId = null,
    stateId = null,
}) {
    const premiumUnlocked =
        await resolvePremiumAssets(
            interaction.user.id
        );

    /*
     * The free pool is only empty when every set is premium, which is the
     * one case that deserves an upsell rather than an error.
     */
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

    const resolvedStateId =
        stateId ??
        createState({
            type: "profile",
            userId: interaction.user.id,
            guildId: interaction.guildId,
            aestheticId: filters.aestheticId ?? null,
            moodId: filters.moodId ?? null,
            packName,
            profileSetId: profileSet.id,
        });

    return {
        locked: false,
        profileSet,
        stateId: resolvedStateId,
        payload: buildProfileResponse(
            profileSet,
            packName,
            resolvedStateId
        ),
    };
}

async function sendExpiredResponse(interaction) {
    await interaction.reply({
        content:
            "✦ This profile session has expired. Run `/profile` again to generate another set.",

        flags: MessageFlags.Ephemeral,
    });
}

module.exports = {
    customId: "profile:reroll",

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
                    "Only the person who generated this profile can use this control.",

                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        const {
            aestheticId,
            moodId,
            packName,
            profileSetId,
        } = state.data;

        const result = await generateProfile({
            interaction,
            filters: { aestheticId, moodId },
            packName,
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
            result.payload
        );
    },

    generateProfile,
    buildProfileResponse,
};
