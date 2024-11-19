const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'brown',
    description: 'Sends a brown aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/564x/21/c4/30/21c430687e33a209184d85c04e0eb9fe.jpg",
      "https://i.pinimg.com/564x/71/42/f4/7142f47ad1998cce9ad5caf19cdcf8e7.jpg",
      "https://i.pinimg.com/564x/95/c9/6b/95c96bee33ccb72b62191c03250b4c04.jpg",
      "https://i.pinimg.com/564x/82/8d/87/828d87f0bce90303528a5a33b80df099.jpg",
      "https://i.pinimg.com/564x/b6/b3/d6/b6b3d604b1d77e2ed951dca908f6d007.jpg",
      "https://i.pinimg.com/236x/f2/96/55/f29655fb06076f6ecdeb679c1abba5c7.jpg",
      "https://i.pinimg.com/564x/68/58/d1/6858d145accad1f569251131280a2125.jpg",
      "https://i.pinimg.com/564x/ab/74/b6/ab74b6a94bb3412375e1207115b06216.jpg",
      "https://i.pinimg.com/564x/b7/9b/98/b79b986f93df77ffd88b7575144fd34e.jpg",
      "https://i.pinimg.com/564x/57/49/b9/5749b9be08762ae2d5dfb543090177f3.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}