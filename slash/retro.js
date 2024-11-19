const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
  name: 'retro',
  description: 'Sends a retro aesthetic image',
  run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/564x/ad/13/66/ad1366eeaad3e44b81957c732ff14ad5.jpg",
      "https://i.pinimg.com/564x/f2/d0/18/f2d01876e5db9e65c83acab1a5a9bf87.jpg",
      "https://i.pinimg.com/564x/07/23/b5/0723b5a9116eb0119c9dfe13623bc1b5.jpg",
      "https://i.pinimg.com/564x/31/ec/19/31ec19dc1b2b74d62d569b21eaba6c44.jpg",
      "https://i.pinimg.com/564x/b1/a7/3c/b1a73c7b648fc77e24739ff925b9bfe7.jpg",
      "https://i.pinimg.com/564x/e8/f8/6c/e8f86cf80b83de7cbff65afa1c651a5b.jpg",
      "https://i.pinimg.com/564x/1d/aa/cc/1daacca89d38dbad98dfffd1628259db.jpg",
      "https://i.pinimg.com/564x/61/65/d0/6165d0368e918e1e40266ab5aa13d6b1.jpg",
      "https://i.pinimg.com/564x/03/5e/e2/035ee24542423ee1129505f33d0979cb.jpg",
      "https://i.pinimg.com/564x/71/8e/df/718edf3813e1054d6fb8e7260a44a333.jpg",
      "https://i.pinimg.com/564x/ea/19/ea/ea19eaf0b96a6597d09c65aaf5d5f064.jpg",
      "https://i.pinimg.com/564x/86/d2/70/86d2708996efbaaa032ee87c31c64efc.jpg",
      "https://i.pinimg.com/564x/34/6b/37/346b376748994eeb6372007d9bdf924e.jpg",
      "https://i.pinimg.com/564x/2a/73/fd/2a73fd263f3a21420daf3b70fb44bc40.jpg",
      "https://i.pinimg.com/736x/78/a7/20/78a720b2196d7ee898a24249070a0751.jpg",
      "https://i.pinimg.com/564x/20/d9/4a/20d94a6f54c2479f9f85d3c8c88203bf.jpg",
      "https://i.pinimg.com/564x/a4/48/87/a44887a16f7444244f66d07e167d5a66.jpg",
      "https://m.media-amazon.com/images/I/91bRhQ8XN+S._AC_SY879_.jpg",
      "https://i.pinimg.com/564x/88/56/d3/8856d3c3fac5c785766cd72b79839eed.jpg",
      "https://i.pinimg.com/564x/45/07/11/45071128d72e8e17cc59f1e0d3ffbff9.jpg",
      "https://i.pinimg.com/564x/35/4c/fc/354cfc7caf053370d3aa5813048ddad9.jpg",
      "https://i.pinimg.com/564x/ac/71/5e/ac715e79eda8e456229ece72c7d9ae44.jpg",
      "https://i.pinimg.com/564x/1b/cb/ca/1bcbcab692e508ea2adae8b52513140d.jpg",
      "https://i.pinimg.com/736x/bd/b5/5d/bdb55dc5d38b48caeede1b796c4c6854.jpg",
      "https://i.pinimg.com/736x/55/b5/9e/55b59efb636eaa54721a6c38e4d1d7f7.jpg",
      "https://i.pinimg.com/564x/6f/ee/52/6fee5229e305d57f79eb5b5c6a677fda.jpg",
      "https://i.pinimg.com/564x/84/d3/74/84d374f8af97c6ba0f9ef20bd53b5f01.jpg",
      "https://i.pinimg.com/564x/91/09/27/910927d2cc5db7ae73b8fb60a3b82085.jpg",
      "https://i.pinimg.com/564x/9d/49/2f/9d492f086293b5f44bd66122e32a8f62.jpg",
      "https://i.pinimg.com/564x/ad/ca/68/adca68f9d85ff5c40d2637f270a1245f.jpg",
      "https://i.pinimg.com/564x/de/7e/db/de7edb7e5bc9551683f7e15aea1d2a51.jpg",
      "https://i.pinimg.com/564x/9b/e5/40/9be5401b1491c61ea4d597c33f0d5e6b.jpg",
      "https://i.pinimg.com/736x/81/35/33/8135339e3a9bdffe6540495a3a2f3518.jpg",
      "https://i.pinimg.com/564x/82/4c/45/824c45dfebe90d2a0374b6bb68bb535a.jpg",
      "https://i.pinimg.com/736x/eb/4e/c3/eb4ec3aea99e250045b9c5c20fc80bfb.jpg",
      "https://i.pinimg.com/564x/bb/cd/9e/bbcd9e5e726a9c70cc86f8151d98a980.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}