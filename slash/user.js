const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
	name: 'user',
	description: 'Sends information on the user that used this command',
	run: async (client, interaction, args) => {
		// interaction.user is the object representing the User who ran the command
		// interaction.member is the GuildMember object, which represents the user in the specific guild
		await await interaction.followUp(`This command was run by ${interaction.user.username}, who joined on ${interaction.member.joinedAt}.`);
	},
};