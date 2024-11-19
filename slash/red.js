const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'red',
    description: 'Sends a red aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/originals/90/34/5a/90345aec8a77be422b546aa5c0fc2721.gif",
      "https://i.pinimg.com/originals/e4/92/9b/e4929bc9ad39984304d4144e0c9c54a1.gif",
      "https://i.pinimg.com/originals/5f/83/a5/5f83a55e369cffcf4bdcd295805ac312.gif",
      "https://i.pinimg.com/originals/b4/cc/2c/b4cc2c065fc0dd2ffc1a3d4a465a900f.gif",
      "https://i.pinimg.com/originals/48/bd/9f/48bd9f9a0032823dd5abea88c5ce57a0.gif",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}