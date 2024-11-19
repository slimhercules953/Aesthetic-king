const { CommandInteraction } = require('discord.js');

module.exports = {
  name: "black",
  description: "Sends a black aesthetic image",
  options: [], // Add options if needed
  run: async (client, interaction, args) => {
      var images = [
        "https://i.pinimg.com/originals/97/51/75/975175000cb74a77c77fb0225a4121c8.gif",
        "https://i.pinimg.com/236x/17/61/9d/17619d883a2a8c2a6b3928402d2bc424.jpg",
        "https://i.pinimg.com/236x/67/4e/48/674e48b3bc2477b440b1b130dfd29ed9.jpg",
        "https://i.pinimg.com/236x/62/0c/58/620c58a83dd2ec35655f0769025bdd80.jpg",
        "https://i.pinimg.com/736x/b8/26/38/b82638960c9e03c885b40a8d1ff2414f.jpg",
        "https://i.pinimg.com/originals/6b/2a/be/6b2abe877a706e801c49229ef351f30a.gif",
        "https://i.pinimg.com/236x/22/e5/f3/22e5f32701937ff85be416f5974a890c.jpg",
        "https://i.pinimg.com/236x/cb/13/81/cb13814661166aa985ad7e266c335bf4.jpg",
        "https://i.pinimg.com/236x/41/0b/82/410b82406ebc5b673c98ad32fcd531c8.jpg",
        "https://i.pinimg.com/236x/ce/fe/8e/cefe8e3d1e1568139091dc5def260b80.jpg",
        "https://i.pinimg.com/236x/93/57/92/9357921cd7e60f50ed0957cc7bcc111d.jpg",
        "https://i.pinimg.com/236x/b0/29/05/b0290576644950e89254d9d205514185.jpg",
        "https://i.pinimg.com/236x/67/bf/22/67bf22911229374025a02b6f1ce916df.jpg",
        "https://i.pinimg.com/236x/5b/ea/ae/5beaaee814a18b1e698791b189569889.jpg",
        "https://i.pinimg.com/236x/f7/a9/e9/f7a9e9aa3ade2271a2dd4b4186831f9f.jpg",
        "https://i.pinimg.com/236x/c2/77/38/c2773840602f4b064205c3f1a469db24.jpg",
        "https://i.pinimg.com/236x/8b/7a/ca/8b7aca53f32aa957daff5a4048dd8909.jpg",
      ];

      // Pick a random image
      var image = Math.floor(Math.random() * images.length);
      await interaction.followUp(String([images[image]]))
    }
  }
  