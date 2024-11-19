const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'ping',
    description: 'Go away',
    run: async (client, interaction, args) => {
		await interaction.followUp('Pong!');
	},
};