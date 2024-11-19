const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
  name: 'server',
  description: 'Sends information on the server',
  run: async (client, interaction, args) => {
		// interaction.guild is the object representing the Guild in which the command was run
		await interaction.followUp(`This server is ${interaction.guild.name} and has ${interaction.guild.memberCount} members.`);
	},
};