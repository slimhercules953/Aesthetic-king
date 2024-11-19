const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'white',
    description: 'Sends a white aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/originals/e4/30/9d/e4309d620dd2286d9d43031969b9b4a9.gif",
      "https://i.pinimg.com/originals/49/9e/38/499e38ee7c0500ff5c2798429f744abf.gif",
      "https://i.pinimg.com/originals/f7/4d/23/f74d23f7b1596a89e79b9d4444f82287.gif",
      "https://i.pinimg.com/originals/c3/e5/55/c3e5553887d77b7ea69161612becb168.gif",
      "https://i.pinimg.com/originals/36/f7/b5/36f7b5947e1ff1af72c435ffffa7b8a0.gif",
      "https://i.pinimg.com/originals/52/47/82/524782c5d6ff68f9be175f72a22b1eb4.gif",
      "https://i.pinimg.com/originals/ca/4c/e0/ca4ce00f3b9e907ba79c5c253c5e4fa5.gif",
      "https://i.pinimg.com/originals/a9/ad/10/a9ad108cb7fea9b410d072af382216e5.gif",
      "https://i.pinimg.com/originals/17/43/59/174359d6c7e31330affd9322a828e20b.gif",
      "https://i.pinimg.com/originals/e0/1e/95/e01e959c17ccd510862103372d7f7edd.gif",
      "https://giphy.com/gifs/love-black-and-white-heart-wzclsv1x3zhVS",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}