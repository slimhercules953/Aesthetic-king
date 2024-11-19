const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'gothic',
    description: 'Sends a gothic aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
      "https://i.pinimg.com/564x/ce/4b/11/ce4b11c8c9c6674d24f38806f0e5f881.jpg",
      "https://i.pinimg.com/564x/b8/71/6c/b8716c4ed8d1390032de0f58edbe0a5d.jpg",
      "https://i.pinimg.com/564x/c1/59/bf/c159bfb959d2630925b780b70b6000ef.jpg",
      "https://i.pinimg.com/564x/bc/77/0b/bc770bdf8129b3b52d42fd91354cebdd.jpg",
      "https://i.pinimg.com/564x/67/14/1b/67141b7e78bbcf1273af1b850182131a.jpg",
      "https://i.pinimg.com/564x/f6/d3/7c/f6d37c0b1f5395595665bd419c64e862.jpg",
      "https://i.pinimg.com/564x/94/20/42/9420426c724f197b3a38d83266cb2e22.jpg",
      "https://i.pinimg.com/564x/a9/ea/9e/a9ea9e2f9ae2ddb5705c225e4bab26ad.jpg",
      "https://i.pinimg.com/564x/33/18/26/331826377705d1cfd312dfc49b0c56a2.jpg",
      "https://i.pinimg.com/564x/46/bb/b8/46bbb81026c629d7d574d7dd2fe85b53.jpg",
      "https://i.pinimg.com/564x/44/fb/54/44fb542be83e6c6b98972c9e3dc885b1.jpg",
      "https://i.pinimg.com/564x/87/96/d4/8796d4b41af81fbc9b7f69b6a81fc792.jpg",
      "https://i.pinimg.com/564x/a2/0f/6a/a20f6a46fd4b29a8ac67ef4b372aabaf.jpg",
      "https://i.pinimg.com/564x/3a/50/06/3a5006c3f50c7ca95f2d0c6f68bcd097.jpg",
      "https://i.pinimg.com/564x/92/b8/29/92b82919334851dfd3771451d53519ef.jpg",
      "https://i.pinimg.com/564x/00/9b/bc/009bbc655090354dc85e12d5f1887c56.jpg",
      "https://i.pinimg.com/564x/53/74/81/53748108fc03a73a3887f5839d0b5338.jpg",
      "https://i.pinimg.com/564x/9e/6a/03/9e6a03bc619bb2a2b117a651450b77fd.jpg",
      "https://i.pinimg.com/564x/b8/64/a6/b864a6f4fa55cf4fd28d041fd5185157.jpg",
      "https://i.pinimg.com/564x/af/98/bf/af98bfe4e3e1f2c765caef43cff245f3.jpg",
      "https://i.pinimg.com/564x/89/53/2f/89532f9a810261b93c3c97ff59b41f2b.jpg",
      "https://i.pinimg.com/564x/c8/85/74/c88574971bab037324f682e0d850a696.jpg",
      "https://i.pinimg.com/564x/be/0d/ca/be0dca4ade1cd595f96501e2291c2e61.jpg",
      "https://i.pinimg.com/564x/8e/42/6d/8e426d007e7f36af22e6c0e56e75d579.jpg",
      "https://i.pinimg.com/564x/29/82/2b/29822bd966a408b71c98b75ff6b95cdd.jpg",
      "https://i.pinimg.com/564x/0d/a8/a5/0da8a56784c1201c9f0f58f2b948aa48.jpg",
      "https://i.pinimg.com/564x/2e/80/45/2e804579a140fa0445774cf376a283fd.jpg",
      "https://i.pinimg.com/564x/b4/f0/e2/b4f0e254555edadcb8d0126e340936c1.jpg",
      "https://i.pinimg.com/564x/5e/9d/73/5e9d735aa37784bac2d48c25f5d1e6b9.jpg",
      "https://i.pinimg.com/564x/b1/6f/28/b16f28e73046779c7ffd3ea951508a03.jpg",
      "https://i.pinimg.com/564x/99/02/5a/99025a018c0fe077266462b5074827e8.jpg",
      "https://i.pinimg.com/564x/65/db/44/65db44b4a6228f83d5a5035c016b5852.jpg",
      "https://i.pinimg.com/564x/2b/a7/24/2ba724eff5626797ddc59138110aa105.jpg",
      "https://i.pinimg.com/564x/67/2d/c8/672dc8c68e8e753669ad7723d04a60ff.jpg",
      "https://i.pinimg.com/564x/fc/30/aa/fc30aac4570af25942fa4f951f04d90c.jpg",
      "https://i.pinimg.com/564x/76/da/1c/76da1c8793686699538fdf0fc02277de.jpg",
      "https://i.pinimg.com/564x/7d/af/41/7daf41ba8a520def8e16408f04fee4d6.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}