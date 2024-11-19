module.exports = {
  name: "yellow",
  description: "Sends a yellow aesthetic image",
  options: [], // Add options if needed
  run: async (client, interaction, args) => {
    var images = [
      "https://64.media.tumblr.com/cbeff4d8eaf8396938a549e5fe0c1109/tumblr_p374atcUBb1wxzqh3o1_400.gif",
    ];
    var image = Math.floor(Math.random() * images.length);
    interaction.followUp(String([images[image]]))
  }
}