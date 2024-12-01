const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
	name: 'user',
	description: 'Sends information on the user that used this command',
	run: async (client, interaction, args) => {
		await await interaction.followUp(`This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`);
	},
};