module.exports = {
  name: "yellow",
  description: "Sends a yellow aesthetic image",
  options: [], // Add options if needed
  run: async (client, interaction, args) => {
    var images = [
      "https://64.media.tumblr.com/cbeff4d8eaf8396938a549e5fe0c1109/tumblr_p374atcUBb1wxzqh3o1_400.gif",
      "https://i.pinimg.com/originals/66/64/f6/6664f6e8b74061b3ad3d4ab2e81c24ec.gif",
      "https://i.pinimg.com/736x/7d/e8/cc/7de8cc4f64e2a62a4ebcf0db602bed8c.jpg",
      "https://i.pinimg.com/736x/ff/5c/76/ff5c762b6bb9c79b69210f3eb171eb5b.jpg",
      "https://i.pinimg.com/736x/28/98/e5/2898e58ca675cbf6b7fb18c7a5dbbc75.jpg",
      "https://i.pinimg.com/originals/6e/b7/26/6eb726ee182421c571a366cd1f2218a3.gif",
      "https://i.pinimg.com/originals/22/4a/9d/224a9d39157211a36e3e1d43cc0fccf4.gif",
      "https://i.pinimg.com/736x/ca/0e/5a/ca0e5a8e8b9d23e4371482ac638630be.jpg",
      "https://i.pinimg.com/736x/ef/73/b9/ef73b982657a39050a138d8e68746494.jpg",
      "https://i.pinimg.com/736x/d7/76/c2/d776c2bc9b4b57b55cc62cfa8cd818aa.jpg",
      "https://i.pinimg.com/736x/c3/09/51/c30951cf633b61dd9ac347f3b634f130.jpg",
      "https://i.pinimg.com/736x/c0/0f/90/c00f904acf1b4f5330bd2f0f7fa94a32.jpg",
      "https://i.pinimg.com/736x/97/b2/6e/97b26ee75cde7e44e74a923fbdc116bd.jpg",
      "https://i.pinimg.com/736x/13/7f/10/137f10ccf01a5be273e18397e5aeaf47.jpg",
      "https://i.pinimg.com/736x/49/d8/2b/49d82b22e634324c5af8b1574a1e11a7.jpg",
      "https://i.pinimg.com/736x/c4/5e/e4/c45ee4dd0c44943c179b34a4c895420c.jpg",
      "https://i.pinimg.com/736x/48/93/03/489303971c4610dd589296423b83e4ff.jpg",
      "https://i.pinimg.com/736x/50/d5/91/50d591396cb85efc6d16211500602329.jpg",
      "https://i.pinimg.com/736x/42/73/39/42733993c593614d4c8ed5fa903c97fa.jpg",
      "https://i.pinimg.com/736x/72/70/95/72709546c1b0c3267e61aba53d5cd786.jpg",
      "https://i.pinimg.com/736x/99/0e/a8/990ea89b00fc8078cc069f8a0318008f.jpg",
      "https://i.pinimg.com/736x/c7/e3/b3/c7e3b3e5d04a8c6dc0c213f100ec2668.jpg",
      "https://i.pinimg.com/736x/74/af/f2/74aff2eb721f014014d785f57f7026b0.jpg",
      "https://i.pinimg.com/736x/32/83/77/3283776f8129d1a5ff78596a61315285.jpg",
      "https://i.pinimg.com/736x/51/81/14/518114ab8ff087222f694e5411093588.jpg",
      "https://i.pinimg.com/736x/33/fb/b9/33fbb93babac3279abd1f0d56cf39379.jpg",
      "https://i.pinimg.com/736x/f1/7d/d6/f17dd6561e16f6f0c57030a2cbf38b7e.jpg",
      "https://i.pinimg.com/736x/e6/ab/cd/e6abcd5184e75a05fdba19efab1376f9.jpg",
      "https://i.pinimg.com/736x/01/15/c0/0115c0ac4433632ff7abf3c95d57347c.jpg",
      "https://i.pinimg.com/736x/eb/8c/5a/eb8c5a2b3748e1c4575288e85a700d12.jpg",
      "https://i.pinimg.com/736x/a1/ee/f0/a1eef0958d48844c8fe49a1accdaac31.jpg",
      "https://i.pinimg.com/736x/a8/07/f1/a807f11414b80834180246e93e859e94.jpg",
    ];
    var image = Math.floor(Math.random() * images.length);
    interaction.followUp(String([images[image]]))
  }
}