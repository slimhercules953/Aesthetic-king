const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'pastel',
    description: 'Sends a pastel aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/474x/6b/38/bf/6b38bf0c226b8db3bb3cd651f3e283ff.jpg",
      "https://i.pinimg.com/474x/53/6a/5b/536a5b0ebad0e7c4df84538eeb24b3af.jpg",
      "https://i.pinimg.com/474x/fa/77/a9/fa77a91fb0b14e2fc8a7673ffbf3a48c.jpg",
      "https://i.pinimg.com/474x/23/1b/65/231b6533f1baf485d8f593ac0c767bb6.jpg",
      "https://i.pinimg.com/474x/a2/70/11/a27011a0630e9f9ca225926a89dc0334.jpg",
      "https://i.pinimg.com/474x/9d/ba/b9/9dbab96d99e48053d2dad12682b11340.jpg",
      "https://i.pinimg.com/474x/13/79/14/137914a6efe975fc032aab5743006718.jpg",
      "https://i.pinimg.com/474x/ab/10/cc/ab10ccfb1fd8683c8e7711c006f9f980.jpg",
      "https://i.pinimg.com/474x/30/df/1d/30df1d9b696b7464c4ef7e9c23a26f0b.jpg",
      "https://i.pinimg.com/474x/43/d8/ff/43d8ffb9f66611ab5448eb4129f1283c.jpg",
      "https://i.pinimg.com/474x/16/7f/5f/167f5f730db0e9a04e88b63596f26a62.jpg",
      "https://i.pinimg.com/474x/ff/72/71/ff7271a0975a58a05310f76095569382.jpg",
      "https://i.pinimg.com/474x/13/57/d8/1357d8914d224bafda242df198eba77c.jpg",
      "https://i.pinimg.com/474x/42/76/7a/42767a26b9ec7a391d72c3b43b055ba9.jpg",
      "https://i.pinimg.com/474x/68/9a/39/689a39e902224f7d494bcd3602fd562c.jpg",
      "https://i.pinimg.com/474x/b5/31/fe/b531fe880899f4be0e40dac92d50e6f1.jpg",
      "https://i.pinimg.com/474x/d1/57/e8/d157e8097080b76f6c92b79b6349e94a.jpg",
      "https://i.pinimg.com/474x/78/80/b2/7880b2d0f2387da5523e55fc7ad038c1.jpg",
      "https://i.pinimg.com/474x/a5/7f/72/a57f72ac7c5517c0c72437de6223c784.jpg",
      "https://i.pinimg.com/474x/de/36/ff/de36ff1911e099f6753f51af007b7acd.jpg",
      "https://i.pinimg.com/474x/c4/65/aa/c465aa1de963b241b02b30312c5bbfd3.jpg",
     ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}