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
      "https://i.pinimg.com/736x/77/cc/60/77cc60c5ed3e2b0ac6590e493ef68372.jpg",
      "https://i.pinimg.com/736x/25/75/f6/2575f6a59d64c60fc3f4939256d1412f.jpg",
      "https://i.pinimg.com/736x/b1/21/3e/b1213ebd57d21e9b771603186e098b5b.jpg",
      "https://i.pinimg.com/736x/59/b7/9e/59b79effea0cc43cf686b535eb49268a.jpg",
      "https://i.pinimg.com/736x/1d/43/15/1d43157660ba73edab87ad31cfe8b5e1.jpg",
      "https://i.pinimg.com/736x/66/28/85/662885e847285233f25d4963349b308e.jpg",
      "https://i.pinimg.com/736x/e2/1f/bb/e21fbba3b12e688a7194187c012fc8ec.jpg",
      "https://i.pinimg.com/736x/20/8d/fe/208dfe9a8c295fc36e34bf460477ec6f.jpg",
      "https://i.pinimg.com/736x/92/76/ea/9276ea121ccce18c6a506181662f045e.jpg",
      "https://i.pinimg.com/736x/b3/ba/9a/b3ba9af7a865b0aae4288882cf9c9f89.jpg",
      "https://i.pinimg.com/736x/4d/cf/e7/4dcfe726c6b564c98fee7cac0befddbd.jpg",
      "https://i.pinimg.com/originals/0a/ac/07/0aac079f238528a95e635f6d4eace614.gif",
      "https://i.pinimg.com/originals/a6/48/4a/a6484a775728e1facfe64961ebcf9812.gif",
      "https://i.pinimg.com/736x/ff/fa/81/fffa81877214605c4cf86cfc2ef76822.jpg",
      "https://i.pinimg.com/736x/2e/36/bc/2e36bc37f1571e51cbc950027e4bff9b.jpg",
      "https://i.pinimg.com/736x/e0/40/5d/e0405d39770f9cc2635e5d0c8eeee27b.jpg",
      "https://i.pinimg.com/736x/63/a3/44/63a3449784170d0adbb69bdbb30e695d.jpg",
      "https://i.pinimg.com/736x/6c/47/7f/6c477f20bbfa2110beac8af0c867485f.jpg",
      "https://i.pinimg.com/736x/26/04/2e/26042e7afd68d90588f33010646b01a1.jpg",
      "https://i.pinimg.com/736x/e5/c9/46/e5c94661f29e1be4ddd5d98c40afe020.jpg",
      "https://i.pinimg.com/736x/c6/01/42/c60142f25e0ed847c4ec1abdd20a59e1.jpg",
      "https://i.pinimg.com/736x/a6/b6/04/a6b604b50aa9bd2ecde095a9ee2faaa7.jpg",
      "https://i.pinimg.com/736x/0d/a0/b5/0da0b5dfe7dee5c081a568b2ae93f406.jpg",
      "https://i.pinimg.com/736x/cd/93/09/cd93093444b31bc3f9268be008c73700.jpg",
      "https://i.pinimg.com/736x/79/db/79/79db791abcd01d9fa906dd49583e6cf5.jpg",
      "https://i.pinimg.com/736x/71/37/de/7137dee8745cf2486aef7b18f218bec7.jpg",
      "https://i.pinimg.com/736x/2e/2f/69/2e2f6907de0cbf3f046536f3326d6be6.jpg",
      "https://i.pinimg.com/736x/af/48/b1/af48b1baaeeb28ab6b5c4c5edaf180ce.jpg",
      "https://i.pinimg.com/736x/29/ce/43/29ce43851393878d4741716e595b324a.jpg",
      "https://i.pinimg.com/736x/80/03/18/800318a8642555a573595fa63670a853.jpg",
      "https://i.pinimg.com/736x/41/cd/dc/41cddc17dd32de00845852030827c4c5.jpg",
      "https://i.pinimg.com/736x/57/dc/9c/57dc9c8263a1d354edcfdf3fe58c8c33.jpg",
      "https://i.pinimg.com/736x/63/7d/42/637d428dbdd82f0e9473a210ad9e8c8a.jpg",
      "https://i.pinimg.com/736x/f0/a1/cf/f0a1cfb563ad812d15345916ebbfa8af.jpg",
      "https://i.pinimg.com/736x/61/a8/cf/61a8cfc9446138cc379b6383831ecd6f.jpg",
      "https://i.pinimg.com/736x/02/2a/53/022a53117588e268d2378ed76f4272f1.jpg",
      "https://i.pinimg.com/736x/8d/17/3f/8d173f8ade637cbabf365616d1af4281.jpg",
      "https://i.pinimg.com/736x/9c/00/91/9c0091ac434d816f8584283d0a682c09.jpg",
      "https://i.pinimg.com/736x/91/2e/61/912e617d91e68f69427e3bf5c7ee0fad.jpg",
      "https://i.pinimg.com/736x/31/10/66/311066d1d2ed62effd8b5622162ca31e.jpg",
      "https://i.pinimg.com/736x/7f/d3/a7/7fd3a776a43352588557000c8f429fa1.jpg",
      "https://i.pinimg.com/736x/bf/c0/f0/bfc0f06cea9859323d2e675493f1b8b8.jpg",
      "https://i.pinimg.com/736x/5b/45/46/5b454612c4d9283e8eb0c788a8b99300.jpg",
      "https://i.pinimg.com/736x/28/3b/e0/283be0183029070715c2fd851356d949.jpg",
      "https://i.pinimg.com/736x/15/68/ee/1568ee359237ac60be54314a558f41be.jpg",
      "https://i.pinimg.com/736x/15/77/87/157787c6a755d04c789b436d6540875a.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    await interaction.followUp(String([images[image]]))
  }
}