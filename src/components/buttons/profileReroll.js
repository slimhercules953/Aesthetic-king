const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getRandomProfileSet,
} = require("../../services/assets/assetService");

function buildProfileResponse(profileSet) {
    const embed = new EmbedBuilder()
        .setTitle("✦ Your Aesthetic Profile")
        .setDescription(
            "A matching profile picture and banner set selected for you."
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
            text: `Profile Set ${profileSet.id}`,
        });

    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId("profile:reroll")
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

module.exports = {
    customId: "profile:reroll",

    async execute(interaction) {
        await interaction.deferUpdate();

        const profileSet =
            await getRandomProfileSet();

        await interaction.editReply(
            buildProfileResponse(profileSet)
        );
    },

    buildProfileResponse,
};