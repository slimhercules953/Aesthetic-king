const { GoogleGenerativeAI } = require("@google/generative-ai")
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const getColors = require('get-image-colors');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { AttachmentBuilder } = require("discord.js")
const fetch = require('node-fetch'); // Needed to fetch images from URLs

// Configure AWS SDK for Cloudflare R2
const r2 = new S3Client({
  endpoint: 'https://a6e0195cedde864ddf51dee117a96a14.r2.cloudflarestorage.com', // Replace with your R2 account endpoint
  region: 'auto',
  credentials: {
    accessKeyId: process.env.r2accesskey, // Your R2 access key
    secretAccessKey: process.env.r2SAK,  // Your R2 secret key
    // sessionToken: process.env.r2token,
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
    name: "theme",
    description: "Creates a profile layout for a pfp and banner pair so that you can see if you like it",
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

        const testurl = `https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${bannerurl}`
        // Fetch the image and create a buffer
        const response = await fetch(testurl);
        if (!response.ok) throw new Error('Failed to fetch the image.');
        const imageBuffer = await response.buffer();

        // Extract colors using get-image-colors
        const hmm = await getColors(imageBuffer, 'image/jpeg'); // Specify the image type (e.g., 'image/png' or 'image/jpeg')

        if (!hmm.length) {
        await interaction.followUp({
            content: 'No colors could be extracted from the provided image.',
            ephemeral: true,
        });
        return;
        }
        
        // Format extracted colors
        const colorDescriptions = hmm
        .map((color1, index) => {
            const hex = color1.hex();
            return `**Color ${index + 1}:** ${hex}`;
        })
        .join('\n');

    // const imageResp = await fetch(
    //     `https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${pfpurl}`
    // )
    //     .then((response) => response.arrayBuffer());

    // const result = await model.generateContent([
    //     {
    //         inlineData: {
    //             data: Buffer.from(imageResp).toString("base64"),
    //             mimeType: "image/jpeg",
    //         },
    //     },
    //     'What are the 3 most prominent color of this image in hexadecimal ? ONLY REPLY WITH 3 HEXADECIMAL IN ONE LINE SEPERATED WITH A SPACE THAT ARE NOT SIMILAR TO WHITE OR BLACK',
    // ]);
    // const str = result.response.text()
    // const color1 = str.split(' ');
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
        ctx.fillStyle = hmm[4].hex(); // Black background
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
        drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, cornerRadius, hmm[0].hex());

        // Set the text properties
        ctx.fillStyle = '#ffffff'; // White text
        ctx.font = '35px Arial';

        // Calculate the position to center the text inside the box
        const textPositionX = boxX + (boxWidth / 2) - (ctx.measureText(hmm[0].hex()).width / 2); // Center text horizontally
        const textPositionY = boxY + (boxHeight / 2) + 8; // Center text vertically (adjust for font size)

        // Draw the centered text
        ctx.fillText(hmm[0].hex(), textPositionX, textPositionY);

    
        // Step 4: Secondary Color Box
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
        drawRoundedRect(ctx, secondaryBoxX, secondaryBoxY, secondaryBoxWidth, secondaryBoxHeight, secondaryCornerRadius, hmm[1].hex());

        // Set the text properties
        ctx.fillStyle = '#ffffff'; // White text
        ctx.font = '35px Arial';

        // Calculate the position to center the text inside the secondary box
        const secondaryTextPositionX = secondaryBoxX + (secondaryBoxWidth / 2) - (ctx.measureText(hmm[1].hex()).width / 2); // Center text horizontally
        const secondaryTextPositionY = secondaryBoxY + (secondaryBoxHeight / 2) + 8; // Center text vertically (adjust for font size)

        // Draw the centered text inside the secondary box
        ctx.fillText(hmm[1].hex(), secondaryTextPositionX, secondaryTextPositionY);

    
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

        ctx.fillStyle = '#999999'; // Placeholder gray color
        ctx.fill(); // Fill the circles (placeholders)
        ctx.drawImage(nitro, image1X, rectY6 + (rectHeight6 - imageHeight) / 2, imageWidth, imageHeight); // Image 1
        ctx.drawImage(booster, image2X, rectY6 + (rectHeight6 - imageHeight) / 2, imageWidth, imageHeight); // Image 2
        ctx.drawImage(golden, image3X, rectY6 + (rectHeight6 - imageHeight) / 2, imageWidth, imageHeight); // Image 3



        // Step 8: Save the canvas as an image
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync('output-design.png', buffer);
        // console.log('Design saved as output-design.png');
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