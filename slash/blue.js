const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'blue',
    description: 'Sends a blue aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/originals/39/d2/45/39d245b800aba34d4200443546f47c92.gif",
      "https://i.pinimg.com/originals/1d/1b/bd/1d1bbdaf9b1dff2b85072da5ce738547.gif",
      "https://i.pinimg.com/originals/d1/a3/91/d1a391577bceb02635977ef88181d0be.gif",
      "https://i.pinimg.com/236x/6a/b1/9f/6ab19fb5be480fb25fa1b4f868f6be1a.jpg",
      "https://i.pinimg.com/236x/0d/5e/6d/0d5e6d01ee4ac0b05d64984164aa482a.jpg",
      "https://i.pinimg.com/236x/6d/cf/53/6dcf53b9476c4444b24ff96fe7fc79e8.jpg",
      "https://i.pinimg.com/236x/93/95/8b/93958b1dcae23e8e98365f2c050f9527.jpg",
      "https://i.pinimg.com/236x/7a/f2/c1/7af2c1c343b25af79c00bf201a9c8b86.jpg",
      "https://i.pinimg.com/236x/ad/55/ec/ad55ecd5053b686e38c91048e30ec953.jpg",
      "https://i.pinimg.com/236x/47/6e/77/476e771d2e11684ea0047c7413d3bb9a.jpg",
      "https://i.pinimg.com/236x/de/ce/f3/decef307953bfe54765dffa9d42d5be7.jpg",
      "https://i.pinimg.com/236x/db/d9/75/dbd975a867ffb763452647b3434dbc00.jpg",
      "https://i.pinimg.com/236x/e8/d8/ab/e8d8abe748814fa59dd024a2e6f8cc76.jpg",
      "https://i.pinimg.com/236x/77/5f/b2/775fb292b60cd7bd8b8500633a1bc569.jpg",
      "https://i.pinimg.com/236x/47/60/96/4760969471f9a02fb0ac882a7c62ed9c.jpg",
      "https://giphy.com/gifs/butterflies-zetsuen-no-tempest-GAl8vgiQGY1tS",
      "https://giphy.com/gifs/blue-picture-dnoyd6rMvw29q",
      "https://tenor.com/view/anime-light-blue-aesthetic-gif-19156411",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}