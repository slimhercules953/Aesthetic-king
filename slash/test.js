const { GoogleGenerativeAI } = require("@google/generative-ai")
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { AttachmentBuilder } = require("discord.js")

// Configure AWS SDK for Cloudflare R2
const r2 = new S3Client({
  endpoint: 'https://a6e0195cedde864ddf51dee117a96a14.r2.cloudflarestorage.com', // Replace with your R2 account endpoint
  region: 'auto',
  credentials: {
    accessKeyId: process.env.r2accesskey, // Your R2 access key
    secretAccessKey: process.env.r2SAK,  // Your R2 secret key
  },
});

const bucketName = 'aesthetic-king'; // Replace with your R2 bucket name

// Helper function to fetch all files from the R2 bucket and group by prefix
async function fetchPrefixMap(bucketName) {
  const command = new ListObjectsV2Command({ Bucket: bucketName });
  const data = await r2.send(command);

  if (!data.Contents || data.Contents.length === 0) {
    throw new Error('No files found in the bucket.');
  }

  const prefixMap = {};
  data.Contents.forEach(file => {
    const prefix = file.Key.substring(0, 3); // Extract prefix (e.g., first 3 characters)
    if (!prefixMap[prefix]) {
      prefixMap[prefix] = [];
    }
    prefixMap[prefix].push(file.Key);
  });

  return prefixMap;
}

module.exports = {
    name: "test",
    description: "Captions an image",
    options: [], // Add options if needed
    run: async (client, interaction, args) => {
    // Access your API key as an environment variable (see "Set up your API key" above)
    const genAI = new GoogleGenerativeAI(process.env.apiKey);

    const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-pro' });

    try {
        // Fetch prefix map
        const prefixMap = await fetchPrefixMap(bucketName);
  
        // Select a random prefix
        const prefixes = Object.keys(prefixMap);
        const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const files = prefixMap[randomPrefix];
  
        if (!files || files.length === 0) {
          await interaction.editReply(`No files found with the prefix "${randomPrefix}".`);
          return;
        }
  
        // Prepare embeds and fetch images
        const embeds = [];
        const attachments = [];
        // Loop for "pfp" images
        const pfpFiles = files.filter(file => file.includes('pfp'));
        for (const fileKey of pfpFiles) {
            const imageBufferPFP = await fetchImageBuffer(bucketName, fileKey);
            const attachment = new AttachmentBuilder(imageBufferPFP, { name: fileKey });
            attachments.push(attachment);
        }

        // Loop for "banner" images
        const bannerFiles = files.filter(file => file.includes('banner'));
        for (const fileKey of bannerFiles) {
            const imageBufferBanner = await fetchImageBuffer(bucketName, fileKey);
            const attachment = new AttachmentBuilder(imageBufferBanner, { name: fileKey });
            attachments.push(attachment);
        }
        const pfpurl = pfpFiles[0].split(" ").join("%20")
        const bannerurl = bannerFiles[0].split(" ").join("%20")

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
   
    const imageResp = await fetch(
        `https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${pfpurl}`
    )
        .then((response) => response.arrayBuffer());

    const result = await model.generateContent([
        {
            inlineData: {
                data: Buffer.from(imageResp).toString("base64"),
                mimeType: "image/jpeg",
            },
        },
        'What are the 3 most prominent color of this image in hexadecimal ? ONLY REPLY WITH 3 HEXADECIMAL IN ONE LINE SEPERATED WITH A SPACE THAT ARE NOT SIMILAR TO WHITE OR BLACK',
    ]);
    const str = result.response.text()
    const words = str.split(' ');
    // Helper function to fetch an image buffer from R2
    async function fetchImageBuffer(bucketName, imageKey) {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: imageKey });
    const data = await r2.send(command);
    const chunks = [];
  
    for await (const chunk of data.Body) {
      chunks.push(chunk);
    }
  
    return Buffer.concat(chunks);
    }
  
  // Canvas dimensions
  const canvasWidth = 800;
  const canvasHeight = 1000;
  
  // Create the canvas
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');
  
  // Helper function to draw rounded rectangles
  function drawRoundedRect(ctx, x, y, width, height, radius, color) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  ctx.fillStyle = color;
  ctx.fill();
}
  
  // Main function to draw the design
  async function drawDesign() {
    // Step 1: Black Background
    ctx.fillStyle = words[2]; // Black background
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Add the new rectangle
    const rectX4 = 73;  // Top-left X for the new rectangle
    const rectY4 = 830; // Top-left Y for the new rectangle
    const rectWidth4 = 659 - 73;  // Width of the rectangle
    const rectHeight4 = 982 - 893; // Height of the rectangle

    // Draw the filled grey rectangle
    ctx.fillStyle = '#424549'; // Grey fill color
    ctx.fillRect(rectX4, rectY4, rectWidth4, rectHeight4);

    // Rectangle coordinates (from the HTML <area> tag)
    const rectX = 74; // Top-left X
    const rectY = 73; // Top-left Y
    const rectWidth = 380 - 74; // Rectangle width
    const rectHeight = 380 - 73; // Rectangle height

    // Determine the side length of the square (smaller of width or height)
    const squareSize = Math.min(rectWidth, rectHeight);

    // Load and draw the profile picture as a square
    const profilePicture4 = await loadImage(`https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${pfpurl}`); // Replace with actual path

    // Draw the square profile picture
    ctx.drawImage(profilePicture4, rectX, rectY, squareSize, squareSize);

    // Rectangle coordinates (from the HTML <area> tag)
    const rectX2 = 73; // Top-left X
    const rectY2 = 423; // Top-left Y
    const rectWidth2 = 659 - 73; // Rectangle width
    const rectHeight2 = 643 - 423; // Rectangle height

    // Make the square a little smaller vertically (adjust the height)
    const squareWidth2 = rectWidth2; // Keep the width the same
    const squareHeight2 = rectHeight2 * 0.75; // Make the height 75% of the original height

    // Load and draw the profile picture as a square
    const profilePicture2 = await loadImage(`https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${bannerurl}`); // Replace with actual path

    // Draw the square profile picture in the new position
    ctx.drawImage(profilePicture2, rectX2, rectY2, squareWidth2, squareHeight2);

  
    // Step 3: Primary Color Box
    // New variable names based on the provided coordinates
    const boxX = 392; // Top-left X coordinate
    const boxY = 136; // Top-left Y coordinate
    const boxWidth = 664 - 392; // Width of the box (difference between right and left)
    const boxHeight = 228 - 136; // Height of the box (difference between bottom and top)
    const cornerRadius = 10; // Border radius for rounded corners
    // Set the font and color for the text above the box (larger size)
    ctx.fillStyle = '#ffffff'; // White text
    ctx.font = '35px Arial'; // Increased font size

    const primaryTextAbovePositionX = boxX + (boxWidth / 2) - (ctx.measureText('Primary Color').width / 2); // Center the text above the box
    const primaryTextAbovePositionY = boxY - 20; // Place the text slightly above the box

    // Draw the text above the primary box
    ctx.fillText('Primary Color', primaryTextAbovePositionX, primaryTextAbovePositionY);

    // Draw the rounded rectangle with the new variable names
    drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, cornerRadius, words[0]);

    // Set the text properties
    ctx.fillStyle = '#ffffff'; // White text
    ctx.font = '20px Arial';

    // Calculate the position to center the text inside the box
    const textPositionX = boxX + (boxWidth / 2) - (ctx.measureText(words[0]).width / 2); // Center text horizontally
    const textPositionY = boxY + (boxHeight / 2) + 6; // Center text vertically (adjust for font size)

    // Draw the centered text
    ctx.fillText(words[0], textPositionX, textPositionY);

  
    // Step 4: Secondary Color Box
    // New variable names based on the provided coordinates for secondary
    const secondaryBoxX = 394; // Top-left X coordinate
    const secondaryBoxY = 293; // Top-left Y coordinate
    const secondaryBoxWidth = 664 - 394; // Width of the box (difference between right and left)
    const secondaryBoxHeight = 385 - 293; // Height of the box (difference between bottom and top)
    const secondaryCornerRadius = 10; // Border radius for rounded corners

    // Set the font and color for the text above the box
    ctx.fillStyle = '#ffffff'; // White text
    ctx.font = '35px Arial';
    const secondaryTextAbovePositionX = secondaryBoxX + (secondaryBoxWidth / 2) - (ctx.measureText('Secondary Color').width / 2); // Center the text above the box
    const secondaryTextAbovePositionY = secondaryBoxY - 10; // Place the text slightly above the box

    // Draw the text above the secondary box
    ctx.fillText('Secondary Color', secondaryTextAbovePositionX, secondaryTextAbovePositionY);


    // Draw the rounded rectangle with the new variable names for secondary
    drawRoundedRect(ctx, secondaryBoxX, secondaryBoxY, secondaryBoxWidth, secondaryBoxHeight, secondaryCornerRadius, words[1]);

    // Set the text properties
    ctx.fillStyle = '#ffffff'; // White text
    ctx.font = '20px Arial';

    // Calculate the position to center the text inside the secondary box
    const secondaryTextPositionX = secondaryBoxX + (secondaryBoxWidth / 2) - (ctx.measureText(words[1]).width / 2); // Center text horizontally
    const secondaryTextPositionY = secondaryBoxY + (secondaryBoxHeight / 2) + 6; // Center text vertically (adjust for font size)

    // Draw the centered text inside the secondary box
    ctx.fillText(words[1], secondaryTextPositionX, secondaryTextPositionY);

  
    // Rectangle coordinates (from the HTML <area> tag for the third rectangle)
    const rectX3 = 73; // Top-left X
    const rectY3 = 684; // Top-left Y
    const rectWidth3 = 659 - 73; // Rectangle width
    const rectHeight3 = 893 - 684; // Rectangle height

    // Optionally adjust square dimensions (e.g., to make it smaller or apply other styles)
    const squareWidth3 = rectWidth3; // Use full width of the rectangle
    const squareHeight3 = rectHeight3 * 0.75; // Optionally reduce the height by 25%

    // Load and draw the profile picture or any other content at the third rectangle's location
    const profilePicture3 = await loadImage(`https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${bannerurl}`); // Replace with actual path

    // Draw the image or content inside the third rectangle
    ctx.drawImage(profilePicture3, rectX3, rectY3, squareWidth3, squareHeight3);

    // Circle properties
    const circleX = 178-20; // Center X
    const circleY = 847-20; // Center Y
    const radius = 60; // Radius

    // Draw the filled dark grey circle
    ctx.beginPath(); // Start a new path
    ctx.arc(circleX, circleY, radius, 0, 2 * Math.PI); // Create the circle
    ctx.fillStyle = '#424549'; // Dark grey fill color
    ctx.fill(); // Fill the circle

    // Step 6: Profile Picture
    const profileX = 121-20; // X coordinate adjusted for the left edge of the circle
    const profileY = 802-10-20; // Y coordinate adjusted for the top edge of the circle
    const profileSize = 60 * 2; // Diameter of the circle (2 times the radius)

    // Save the context and create the circle clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(circleX, circleY, 55, 0, Math.PI * 2); // Circle at (178, 879) with a radius of 67
    ctx.closePath();
    ctx.clip();

    // Draw the profile picture within the circular clip
    ctx.drawImage(profilePicture4, profileX, profileY, profileSize, profileSize);

    ctx.restore();

    // Tiny circle properties
    const tinyCircleX = 206; // Center X
    const tinyCircleY = 850; // Center Y
    const tinyCircleRadius = 20; // Radius

    // Draw the filled circle
    ctx.beginPath(); // Start a new path
    ctx.arc(tinyCircleX, tinyCircleY, tinyCircleRadius, 0, 2 * Math.PI); // Create the circle
    ctx.fillStyle = '#282b30'; // Dark grey fill color (or any desired color)
    ctx.fill(); // Fill the circle

    // Draw the smaller green circle inside
    const innerCircleRadius = 15; // Radius of the smaller circle

    ctx.beginPath();
    ctx.arc(tinyCircleX, tinyCircleY, innerCircleRadius, 0, 2 * Math.PI); // Inner smaller circle
    ctx.fillStyle = '#2E8B57'; // Green fill color
    ctx.fill(); // Fill the inner circle

    const rectX5 = 422; // Top-left X
    const rectY5 = 853; // Top-left Y
    const rectWidth5 = 699 - 502; // Rectangle width
    const rectHeight5 = 966 - 913; // Rectangle height
    const borderRadius5 = 15; // Border radius for rounded corners

    // Draw the rounded rectangle
    ctx.beginPath();
    ctx.moveTo(rectX5 + borderRadius5, rectY5); // Move to the top-left corner with radius offset

    // Draw the top edge with rounded corners
    ctx.lineTo(rectX5 + rectWidth5 - borderRadius5, rectY5); 
    ctx.arcTo(rectX5 + rectWidth5, rectY5, rectX5 + rectWidth5, rectY5 + rectHeight5, borderRadius5);

    // Draw the right edge with rounded corners
    ctx.lineTo(rectX5 + rectWidth5, rectY5 + rectHeight5 - borderRadius5);
    ctx.arcTo(rectX5 + rectWidth5, rectY5 + rectHeight5, rectX5 + rectWidth5 - rectWidth5, rectY5 + rectHeight5, borderRadius5);

    // Draw the bottom edge with rounded corners
    ctx.lineTo(rectX5 + borderRadius5, rectY5 + rectHeight5);
    ctx.arcTo(rectX5, rectY5 + rectHeight5, rectX5, rectY5 + rectHeight5 - borderRadius5, borderRadius5);

    // Draw the left edge with rounded corners
    ctx.lineTo(rectX5, rectY5 + borderRadius5);
    ctx.arcTo(rectX5, rectY5, rectX5 + borderRadius5, rectY5, borderRadius5);

    ctx.closePath();
    ctx.fillStyle = '#36393e'; // Dark grey fill color
    ctx.fill(); // Fill the rectangle

    const rectX6 = 422; // Top-left X
    const rectY6 = 853; // Top-left Y
    const rectWidth6 = 659 - 462; // Narrower rectangle width (adjusted to a smaller value)
    const rectHeight6 = 966 - 913; // Rectangle height (can be adjusted if needed)
    const borderRadius6 = 15; // Border radius for rounded corners
    
    // Image properties (you can adjust the size of the placeholders)
    const imageWidth = 35; // Width of the image placeholder
    const imageHeight = 30; // Height of the image placeholder
    
    // Calculate the horizontal space between the images
    const spaceBetweenImages = (rectWidth6 - 3 * imageWidth) / 4; // 4 spaces (left of the first, between, and right of the third)
    
    // Calculate the positions for the 3 images
    const image1X = rectX6 + spaceBetweenImages;
    const image2X = rectX6 + spaceBetweenImages + imageWidth + spaceBetweenImages;
    const image3X = rectX6 + spaceBetweenImages + 2 * (imageWidth + spaceBetweenImages);
    
    // Draw the rounded rectangle
    ctx.beginPath();
    ctx.moveTo(rectX6 + borderRadius6, rectY6); // Move to the top-left corner with radius offset
    
    // Draw the top edge with rounded corners
    ctx.lineTo(rectX6 + rectWidth6 - borderRadius6, rectY6); 
    ctx.arcTo(rectX6 + rectWidth6, rectY6, rectX6 + rectWidth6, rectY6 + rectHeight6, borderRadius6);
    
    // Draw the right edge with rounded corners
    ctx.lineTo(rectX6 + rectWidth6, rectY6 + rectHeight6 - borderRadius6);
    ctx.arcTo(rectX6 + rectWidth6, rectY6 + rectHeight6, rectX6 + rectWidth6 - rectWidth6, rectY6 + rectHeight6, borderRadius6);
    
    // Draw the bottom edge with rounded corners
    ctx.lineTo(rectX6 + borderRadius6, rectY6 + rectHeight6);
    ctx.arcTo(rectX6, rectY6 + rectHeight6, rectX6, rectY6 + rectHeight6 - borderRadius6, borderRadius6);
    
    // Draw the left edge with rounded corners
    ctx.lineTo(rectX6, rectY6 + borderRadius6);
    ctx.arcTo(rectX6, rectY6, rectX6 + borderRadius6, rectY6, borderRadius6);
    
    ctx.closePath();
    ctx.fillStyle = '#36393e'; // Dark grey fill color
    ctx.fill(); // Fill the rectangle
    
    // Draw the placeholders for the images (representing them as circles for simplicity)
    ctx.beginPath();
    const nitro = await loadImage(`./images/nitro.png`);
    const golden = await loadImage(`./images/goldenbug.png`);
    const booster = await loadImage(`./images/booster.png`);

    // ctx.arc(image2X + imageWidth / 2, rectY6 + rectHeight6 / 2, imageWidth / 2, 0, 2 * Math.PI); // Image 2
    // ctx.arc(image3X + imageWidth / 2, rectY6 + rectHeight6 / 2, imageWidth / 2, 0, 2 * Math.PI); // Image 3
    ctx.fillStyle = '#999999'; // Placeholder gray color
    ctx.fill(); // Fill the circles (placeholders)
    ctx.drawImage(nitro, image1X, rectY6 + (rectHeight6 - imageHeight) / 2, imageWidth, imageHeight); // Image 1
    ctx.drawImage(booster, image2X, rectY6 + (rectHeight6 - imageHeight) / 2, imageWidth, imageHeight); // Image 2
    ctx.drawImage(golden, image3X, rectY6 + (rectHeight6 - imageHeight) / 2, imageWidth, imageHeight); // Image 3



    // Step 8: Save the canvas as an image
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync('output-design.png', buffer);
    console.log('Design saved as output-design.png');
    const attachment = new AttachmentBuilder(buffer, { name: 'output-design.png' });
    interaction.followUp({
      content: 'Here is your generated design!',
      files: [attachment],
  });
  }
  
  // Execute the design drawing function
  drawDesign().catch((error) => {
    console.error('Error generating design:', error);
  });

    } catch (error) {
        console.error('Error fetching images:', error);
        await interaction.followUp('An error occurred while fetching images.');
        }
    }
}