const { CommandInteraction, Client, MessageEmbed } = require('discord.js');

module.exports = {
    name: 'orange',
    description: 'Sends an orange aesthetic image',
    run: async (client, interaction, args) => {
    var images = [
          "https://i.pinimg.com/originals/c9/e0/9a/c9e09aed17cef8abb78364a6f19db7ff.gif",
          "https://64.media.tumblr.com/da08aabb464e168680294527044d5fd7/tumblr_pq0ayw2LeN1wbibxe_1280.gif",
          "https://media0.giphy.com/media/5dYiWM1Pm8HMLHVG0Z/giphy.gif?cid=ecf05e47th4w5y90mny0y7frvndzxlz8bnnn2m9kqvs3zosh&rid=giphy.gif&ct=g",
          "https://i.pinimg.com/originals/b8/40/9a/b8409a25686eb0f73d39dcdd022d57f9.gif",
          "https://i.pinimg.com/originals/d4/f8/ae/d4f8ae5cb2a6eac44007256dc2872f7c.gif",
          "https://i.pinimg.com/originals/44/09/78/440978cc2a73b2c347c6e849db7a0850.gif",
          "https://i.pinimg.com/originals/8d/47/54/8d47545fbf4bfb9d0433db320305775e.gif",
          "https://i.pinimg.com/originals/44/f4/51/44f4512cd53d3f138655df8ddcb702b7.gif",
          "https://i.pinimg.com/originals/99/a7/4e/99a74e8885d6674c1bafd738963e2f6a.gif",
          "https://i.pinimg.com/originals/f2/1b/24/f21b241d1a99309b7616cd4131cca911.gif",
          "https://64.media.tumblr.com/655c394ed4a2dea622b45e97b79137b4/1418eb9532e87096-47/s500x750/cae6f0ecb334969a50f9036668950571cc5173ac.gif",
          "https://tenor.com/view/undertale-yellow-flowers-yellow-flower-undertale-flower-gif-23788254",
          "https://giphy.com/gifs/9rvbTDLnUZJLn327jH",
          ];
        var image = Math.floor(Math.random() * images.length);
        await interaction.followUp(String([images[image]]))
      }
    }