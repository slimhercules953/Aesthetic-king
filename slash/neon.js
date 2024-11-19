const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'neon',
    description: 'Sends a neon aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://tenor.com/view/horusultra-neon-japan-vaporwave-japanese-signage-gif-12116853",
      "https://tenor.com/view/vaporwave-gif-23297096",
      "https://tenor.com/view/aestethic-neon-lights-city-purple-gif-16848078",
      "https://tenor.com/view/hearts-aesthetic-love-heartbeat-gif-16351504",
      "https://tenor.com/view/neon-car-car-racer-poolsar-chiggy-choo-neon-lights-gif-15292374",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}