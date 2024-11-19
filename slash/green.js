const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'green',
    description: 'Sends a green aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://64.media.tumblr.com/0de43fc857f6e17728d3dca9f16e514b/tumblr_oxirsm9pKI1vwnw65o1_r2_1280.gif",
      "https://64.media.tumblr.com/314381a060027ad5d9dc3831b27d1c21/tumblr_oymu5ioygX1upu1txo1_500.gif",
      "https://64.media.tumblr.com/cb702a379f86d205edeb1b184c1bedd5/tumblr_pk3srzrBMc1y2tk79o3_500.gif",
      "https://64.media.tumblr.com/7317e8f7f13c464dc4a51de798209b67/tumblr_p1dg8zLc9u1wg7k9po1_500.gif",
      "https://64.media.tumblr.com/1d1dbd654fb2014fe206df786e4742ae/tumblr_p4okppwZ3U1w0sjs5o1_500.gif",
      "https://64.media.tumblr.com/2429531b0fd80b9f86ec456b91f9a828/tumblr_pnffu8MUBw1y5zd2qo1_640.gif",
      "https://64.media.tumblr.com/3f19c370b9a18443fe856d3ea51c94d0/tumblr_pcgi2kqXyN1w2gsimo1_500.gif",
      "https://64.media.tumblr.com/f34906ee0377f3fa4a799df7416d2059/tumblr_pckduioRDC1xsyl45o1_400.gif",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}