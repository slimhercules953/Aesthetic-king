const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'random',
    description: 'Sends a random suggestion to be ran as a command',
    run: async (client, interaction, args) => {
    var colors = [
      "Try typing ```/red```",
      "Try typing ```/orange```",
      "Try typing ```/yellow```",
      "Try typing ```/green```",
      "Try typing ```/purple```",
      "Try typing ```/blue```",
      "Try typing ```/pink```",
      "Try typing ```/black```",
      "Try typing ```/brown```",
      "Try typing ```/white```",
      "Try typing ```/rainbow```",
      "Try typing ```/space```",
    ];
    var color = Math.floor(Math.random() * colors.length);
    await interaction.followUp(String([colors[color]]))
  }
}