const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'vote',
	description: 'Vote for Aesthetic King on Top.gg',
    run: async (client, interaction, args) => {
        const topGGLink = 'https://top.gg/bot/940337120684425216/vote'; // Replace with your bot's top.gg link
        const botavatar = client.user.displayAvatarURL()
        // Create an embed for the vote command
        const embed = new EmbedBuilder()
        .setColor("DarkButNotBlack") // Gold color
        .setTitle('Vote for Me!')
        .setDescription(
            'Your support helps me grow! Click the link below to vote:\n\n' +
            `[Vote Here](${topGGLink})`
        )
        .setFooter({ text: 'Thank you for your support! ❤️' })
        .setThumbnail(botavatar);

        // Reply to the interaction
        await interaction.followUp({ embeds: [embed]}); // Ephemeral for private response
    },
};