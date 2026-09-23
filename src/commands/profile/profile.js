const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const {
    getRandomProfileSet,
} = require("../../services/assets/assetService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("profile")
        .setDescription(
            "Generates a matching aesthetic profile picture and banner."
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const profileSet = await getRandomProfileSet();

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

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Profile Picture")
                .setStyle(ButtonStyle.Link)
                .setURL(profileSet.pfp.url),

            new ButtonBuilder()
                .setLabel("Banner")
                .setStyle(ButtonStyle.Link)
                .setURL(profileSet.banner.url)
        );

        await interaction.editReply({
            embeds: [embed],
            components: [buttons],
        });
    },
};