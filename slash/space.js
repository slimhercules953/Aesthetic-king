const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
  name: 'space',
  description: 'Sends a space aesthetic image',
  run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/originals/a7/82/9d/a7829d1d21b8588169ba87bc6b305039.gif",
      "https://i.pinimg.com/originals/7d/d1/30/7dd1305bf92447d37e81c573440b2580.gif",
      "https://i.pinimg.com/564x/9e/17/a7/9e17a76c357616123ea439cdc3ccd8b7.jpg",
      "https://i.pinimg.com/564x/ae/fe/04/aefe04a25faead977a53bb60efb7c9b6.jpg",
      "https://i.pinimg.com/originals/fa/87/df/fa87df506459fb2a852eeb5d87cc20b6.gif",
      "https://i.pinimg.com/originals/07/71/13/077113332db0c524c6f90257bc21899b.gif",
      "https://i.pinimg.com/originals/c8/6d/49/c86d4934feb1a282b5d2098eb9d57f38.gif",
      "https://i.pinimg.com/originals/85/80/4a/85804a4bb3a48e7cd88b0480889058b0.gif",
      "https://i.pinimg.com/originals/50/5c/ab/505caba3fb1c8c0825325545d9bc8d33.gif",
      "https://i.pinimg.com/originals/ab/87/21/ab872141c38e8b520491c2474b0dde5f.gif",
      "https://i.pinimg.com/originals/a8/fa/f1/a8faf1b25a487ee49e69d06fc4c70178.gif",
      "https://i.pinimg.com/originals/2f/31/8c/2f318c3cad1b7a087dceb1346abc3abb.gif",
      "https://i.pinimg.com/564x/3e/c2/bc/3ec2bc1fe7a117937515c42975269c52.jpg",
      "https://i.pinimg.com/originals/da/3d/ea/da3deae1f3391aa4d781c98ac7d49f7d.gif",
      "https://i.pinimg.com/564x/ef/71/1e/ef711e76ac1f23f269d4ce4c33488efe.jpg",
      "https://i.pinimg.com/236x/89/54/08/895408f36c5c798b767145d551868f3b.jpg",
      "https://i.pinimg.com/236x/ac/ce/f8/accef889f09b27e6c850149feed647d3.jpg",
      "https://i.pinimg.com/736x/c4/99/9b/c4999b17a6f2c273ebac028e89788f4d.jpg",
      "https://i.pinimg.com/564x/ad/74/e7/ad74e76ee8fe1746340b7a7643ce7ece.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}