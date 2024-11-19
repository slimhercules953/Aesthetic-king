const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'rainbow',
    description: 'Sends a rainbow aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/originals/a1/8c/7c/a18c7cb876917ace28c97527df9933de.gif",
      "https://i.pinimg.com/originals/d7/b1/a0/d7b1a01bb1b66b19d1811f1a9f85d8dc.gif",
      "https://i.pinimg.com/originals/65/cf/2f/65cf2fae3c9167c43e08c93c581b631d.gif",
      "https://i.pinimg.com/originals/3a/81/db/3a81db953cf9e85d898a7d237a3a735b.gif",
      "https://i.pinimg.com/originals/6c/67/d1/6c67d1bcff18e22da44d275379f56d28.gif",
      "https://i.pinimg.com/originals/0b/87/17/0b8717746ed50bc25f9d2d29bc3c4e0a.gif",
      "https://i.pinimg.com/564x/7a/ea/79/7aea79c345b8664044bb942a1f1615ad.jpg",
      "https://i.pinimg.com/originals/dd/32/89/dd3289cf243187c60e34ce2dc5ebf87a.gif",
      "https://i.pinimg.com/originals/66/d2/d1/66d2d1f85a52455c4ea34be73a07f4f5.gif",
      "https://i.pinimg.com/originals/7f/40/cf/7f40cf8004e3840757aefeb985a609ea.gif",
      "https://i.pinimg.com/originals/3d/94/c1/3d94c139cdedd5ab657647402a95bf79.gif",
      "https://i.pinimg.com/originals/98/c3/a7/98c3a76f492c5743861ac6f8210fa020.gif",
      "https://i.pinimg.com/originals/23/8b/d7/238bd7250a953bbd9e0387410f462e4a.gif",
      "https://i.pinimg.com/originals/e7/82/a7/e782a75d0f15ae1f8d101925099e0ce1.gif",
      "https://i.pinimg.com/originals/c1/9e/c3/c19ec3e227e24bb87f422a52081fbbae.gif",
      "https://i.pinimg.com/originals/74/cb/8d/74cb8d1a5ca2ad5492b9a8c13a9b394c.gif",
      "https://i.pinimg.com/originals/55/27/26/552726237bead1ed9e407dbaa666c7fe.gif",
      "https://i.pinimg.com/originals/d4/0c/d2/d40cd2f009ed7a0812bb4298de3c3b07.gif",
      "https://i.pinimg.com/originals/44/23/0c/44230cb48bab7fe8692df79148b199d1.gif",
      "https://i.pinimg.com/originals/3a/81/db/3a81db953cf9e85d898a7d237a3a735b.gif",
      "https://i.pinimg.com/originals/43/2b/e0/432be05c41ec7792be5e8ba6778fc4e8.gif",
      "https://i.pinimg.com/originals/d4/29/d6/d429d6042979d29db2fc100f4aa841c5.gif",
      "https://i.pinimg.com/originals/95/3d/d7/953dd7558818501a5c7dfda28b7714e1.gif",
      "https://i.pinimg.com/originals/c9/cc/5c/c9cc5cbd5c7b4b52a33570c84ac72419.gif",
      "https://i.pinimg.com/originals/3e/4f/6d/3e4f6db86111d3ef4d2b17886af4ec80.gif",
      "https://i.pinimg.com/originals/09/cd/73/09cd73c9bf3e5c5fad66cd5070cf7209.gif",
      "https://i.pinimg.com/originals/34/47/70/34477033630f1ee01b20a86b1a61ba5d.gif",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}