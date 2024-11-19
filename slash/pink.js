const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'pink',
    description: 'Sends a pink aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://64.media.tumblr.com/b27aeb5f612c0283dfc080598c8942f0/a5e561d3812118ba-ba/s500x750/84a75a2f9af78b1f412940ad848c4cbcbfb67b27.gifv",
      "https://i.pinimg.com/originals/53/84/b0/5384b015da97533c9d633eded87d661a.gif",
      "https://i.pinimg.com/originals/04/2a/ef/042aefaccd947a8c07f36b11f228ba2e.gif",
      "https://i.pinimg.com/originals/6f/40/01/6f40010dbf9ad18584707eb0fafe4a9b.gif",
      "https://i.pinimg.com/originals/ce/28/5b/ce285be97f5106a2fc0a68dd5c37a99b.gif",
      "https://tenor.com/view/pink-aesthetic-anime-gif-14682464",
      ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}