const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'purple',
    description: 'Sends a purple aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/originals/30/43/f5/3043f535ad31db8dd1c79063577fbed3.gif",
      "https://i.pinimg.com/originals/81/33/33/8133333cfe4e2d38d606123a5fc59eb4.gif",
      "https://i.pinimg.com/originals/e7/a1/f1/e7a1f10408d696756560b71f807eca24.gif",
      "https://i.pinimg.com/originals/29/54/f6/2954f6fb5fa96cd38b989e265015c30e.gif",
      "https://i.pinimg.com/originals/b0/3c/30/b03c3019ee745265639833313e445fbd.gif",
      "https://i.pinimg.com/originals/c2/4e/a6/c24ea69cda5b0e7ff5ac04d9fcab8aab.gif",
      "https://i.pinimg.com/originals/32/d3/e1/32d3e1965bb1ae38f930d41881b4a060.gif",
      "https://giphy.com/gifs/mmataband-garden-meet-me-at-the-altar-mmata-P4wmW0hHeldm8a1X9R",
      "https://giphy.com/gifs/purple-tokyo-night-drive-KfOdjTchcDEku203WE",
      "https://tenor.com/view/neon-gif-24920276",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}