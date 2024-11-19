const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'minimalist',
    description: 'Sends a minimalist aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/474x/4e/8a/ed/4e8aed319c33e41714a345fd6ce61e11.jpg",
      "https://i.pinimg.com/474x/6f/b7/c4/6fb7c4be207379e1944daae890de7cd7.jpg",
      "https://i.pinimg.com/474x/6f/88/10/6f8810da36e3c35002c6183c37ce9caf.jpg",
      "https://i.pinimg.com/474x/5e/8d/25/5e8d25dab76a95fdd159b8e8766cd448.jpg",
      "https://i.pinimg.com/474x/73/2a/86/732a8671820b38bc6e70786141f070e9.jpg",
      "https://i.pinimg.com/474x/ec/54/f4/ec54f451c9225b96bf2b3714beb036ae.jpg",
      "https://i.pinimg.com/474x/33/29/20/332920b1558206145d8e99240ca8a311.jpg",
      "https://i.pinimg.com/474x/4b/95/17/4b951721f5d74431fc4c937f5f48b63f.jpg",
      "https://i.pinimg.com/474x/78/e8/09/78e8092440222ca78ae1caf94d3d502a.jpg",
      "https://i.pinimg.com/474x/5b/a6/05/5ba6053cb74ab66918e0f8cd5c425234.jpg",
      "https://i.pinimg.com/474x/94/5c/04/945c04226319346294df46857e0976d0.jpg",
      "https://i.pinimg.com/474x/d4/88/c8/d488c8509e51fe3513b97610ecd98b08.jpg",
      "https://i.pinimg.com/474x/18/16/1f/18161fc18e5a70e42f4ca1fda8eba2b5.jpg",
      "https://i.pinimg.com/474x/3f/b7/3a/3fb73a07b0117bdf509ef42ba7c896b7.jpg",
      "https://i.pinimg.com/474x/0d/18/bc/0d18bc32b3c3794d879c6eda4fb01221.jpg",
      "https://i.pinimg.com/474x/a2/e7/4a/a2e74a9b082f74f42fab3cda87b697e1.jpg",
      "https://i.pinimg.com/474x/f2/71/aa/f271aa1c4c3627aeae0e2a530c08fd4f.jpg",
      "https://i.pinimg.com/474x/bc/7d/f4/bc7df483f0ec6390f47c57ff2a873c16.jpg",
      "https://i.pinimg.com/474x/37/fc/2c/37fc2c8028f8af5c6c2c814f044d7166.jpg",
      "https://i.pinimg.com/474x/a8/29/81/a82981a4155504bef1d75d1264175041.jpg",
      "https://i.pinimg.com/474x/de/3e/3a/de3e3a1b6d3a0bae66d22826c928b1ad.jpg",
      "https://i.pinimg.com/474x/65/6a/d1/656ad192210511861fcad4943e78893c.jpg",
      "https://i.pinimg.com/474x/e8/32/e0/e832e024467837a4cb0f5e0dd6b62b01.jpg",
      "https://i.pinimg.com/474x/3f/fb/fa/3ffbfaf30b362ae309c2ca2cf35e366d.jpg",
      "https://i.pinimg.com/474x/b7/6d/80/b76d80f55cd0b06dfa7b703659de0baa.jpg",
      "https://i.pinimg.com/474x/00/77/c0/0077c027d0c35579fb544731b7278ae9.jpg",
      "https://i.pinimg.com/474x/eb/2c/16/eb2c16e3ca606c15f79652a8883644e1.jpg",
      "https://i.pinimg.com/474x/68/2d/a7/682da7ccfcd16c320b88321755177c39.jpg",
      ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}