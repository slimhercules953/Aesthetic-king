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
        "https://i.pinimg.com/736x/2e/1b/63/2e1b63885cd95ad2fe0de615e148d7f0.jpg",
        "https://i.pinimg.com/736x/d0/a0/8c/d0a08c06c445531e19982bb1bdd4d8c2.jpg",
        "https://i.pinimg.com/736x/97/ba/4b/97ba4bba4b2094e517a885852cc111b3.jpg",
        "https://i.pinimg.com/originals/40/eb/91/40eb91545e3870892e1b31df0be95c87.gif",
        "https://i.pinimg.com/736x/0d/84/01/0d840172c48d45541b79079e5d055847.jpg",
        "https://i.pinimg.com/736x/c5/a4/3b/c5a43bb6295943286e2f0e0b8b211882.jpg",
        "https://i.pinimg.com/736x/01/8c/9a/018c9aa9c16cdc9f9263ece0c0e7ab23.jpg",
        "https://i.pinimg.com/736x/d2/ad/e0/d2ade0e9029d4e174397c6305831af02.jpg",
        "https://i.pinimg.com/736x/39/c5/8e/39c58e7d14c32d01be712c0881ec0349.jpg",
        "https://i.pinimg.com/736x/7d/16/94/7d16945371610151c0348632a3a8dcec.jpg",
        "https://i.pinimg.com/736x/67/98/c4/6798c4513566318d6804bc551e935fd4.jpg",
        "https://i.pinimg.com/736x/2d/46/82/2d46822e14a404c825e8e17591602f83.jpg",
        "https://i.pinimg.com/736x/17/cc/59/17cc59b15ee3b540af47aedfd6b69e66.jpg",
        "https://i.pinimg.com/736x/79/65/5a/79655a6e74965e09200799e2a70eb1aa.jpg",
        "https://i.pinimg.com/736x/fa/ca/7b/faca7beed9b0d06ff2fd2f3f51945cde.jpg",
        "https://i.pinimg.com/736x/54/33/c7/5433c7e19a8f8add6af939420c775316.jpg",
        "https://i.pinimg.com/736x/a5/93/a5/a593a5b92f6e516376185bfefd82cf5d.jpg",
        "https://i.pinimg.com/736x/ce/58/51/ce5851993484f8977a34c959aae8b403.jpg",
        "https://i.pinimg.com/736x/3d/47/de/3d47debaed3a941137cd4e91c6e0949e.jpg",
        "https://i.pinimg.com/736x/30/cf/d8/30cfd84e650c2c66f8a80be95aa742d9.jpg",
        "https://i.pinimg.com/736x/ac/3a/84/ac3a8467f33461cf4a28e705e86ba44e.jpg",
        "https://i.pinimg.com/736x/cd/8f/53/cd8f5361e382dbf25c0f7444acdafc4a.jpg",
        "https://i.pinimg.com/736x/39/04/7f/39047f9876ad5dff0c2d9e810f9fe35d.jpg",
        "https://i.pinimg.com/originals/13/56/e5/1356e5ff229a2270742a7b83cac46e83.gif",
        "https://i.pinimg.com/originals/8a/83/c8/8a83c8978f1b376321fde613d460e88d.gif",
        "https://i.pinimg.com/originals/0d/85/9b/0d859b127911d4833d708bd2e65e44d2.gif",
        "https://i.pinimg.com/originals/40/5d/19/405d19767f4964186cdd0d73895a7771.gif",
        "https://i.pinimg.com/originals/9c/d3/e1/9cd3e1eaa3311f4dbd148661529bef83.gif",
        "https://i.pinimg.com/736x/7e/7d/e4/7e7de4407bd6e2173dbf049330043b7e.jpg",
      ];

      // Pick a random image
      var image = Math.floor(Math.random() * images.length);
      await interaction.followUp(String([images[image]]))
    }
  }
  