const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'cyberpunk',
    description: 'Sends a cyberpunk aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/564x/64/50/43/64504370a6d51d15408ab1ac5599692a.jpg",
      "https://i.pinimg.com/564x/f1/60/fc/f160fc005a3ff7cd7b705d10864212d7.jpg",
      "https://i.pinimg.com/564x/14/ba/85/14ba856dcfcbaefa30526287c9418e22.jpg",
      "https://i.pinimg.com/564x/ab/f9/0f/abf90f7f4d0828e39ae54634f432261d.jpg",
      "https://i.pinimg.com/564x/57/1a/2f/571a2f813c0ac19a2f7f76a8859867f5.jpg",
      "https://i.pinimg.com/564x/f2/2c/f2/f22cf2a588a18fe9021081a0472da8a4.jpg",
      "https://i.pinimg.com/564x/be/05/d5/be05d5a544c73053f9506da459a5c207.jpg",
      "https://i.pinimg.com/564x/b1/95/e1/b195e14b72110c1fc514d9624ff08c59.jpg",
      "https://i.pinimg.com/564x/bf/6d/a6/bf6da61921930ba0e09495f28133fab4.jpg",
      "https://i.pinimg.com/564x/9d/e6/a5/9de6a598088d0125d9d9e06be52cd68a.jpg",
      "https://i.pinimg.com/564x/0b/66/0a/0b660a3c903c4a1c995ae4247a2b0ae4.jpg",
      "https://i.pinimg.com/564x/0a/a0/ff/0aa0ff79c0d241f14beb652ab8791cf9.jpg",
      "https://i.pinimg.com/564x/6a/f7/ea/6af7ea111a2016f5b31af3cc3dfb4788.jpg",
      "https://i.pinimg.com/564x/c1/10/ac/c110ac5f89b7ee5dc864385f616d23ba.jpg",
      "https://i.pinimg.com/564x/40/a6/05/40a6054460a5b6ec4fdf6f5de0501bfd.jpg",
      "https://i.pinimg.com/originals/40/34/71/403471007ed4eae52f7df303d9b5ce6d.gif",
      "https://i.pinimg.com/originals/0b/c4/ee/0bc4eecadb2b4e2a743936fd40976797.gif",
      "https://i.pinimg.com/originals/4d/47/1c/4d471c5580a92524fb919dbf0dacfe98.gif",
      "https://i.pinimg.com/564x/b7/5f/99/b75f996101e709ed03ac1d07d447895f.jpg",
      "https://i.pinimg.com/564x/11/84/7c/11847c53615c32b53070eecac1ba0c5b.jpg",
      "https://i.pinimg.com/564x/80/63/af/8063af3baebf5a619ff0f030aedd00ed.jpg",
      "https://i.pinimg.com/564x/c1/65/a9/c165a95ed7722534ec735b64cf89c6c9.jpg",
      "https://i.pinimg.com/564x/ba/c5/39/bac53917706ae0ad745c61fb791c706e.jpg",
      "https://i.pinimg.com/564x/32/c2/2c/32c22ca6ebbaf33ad2de08d3ba34867b.jpg",
      "https://i.pinimg.com/564x/d7/af/dd/d7afdd4eb8a91f84a1d9678f49de72c9.jpg",
      "https://i.pinimg.com/564x/28/63/e3/2863e36ff07183641df24e9cffdd4125.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}