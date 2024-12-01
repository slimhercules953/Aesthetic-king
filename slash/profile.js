const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');

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

// Slash command definition and handler
module.exports = {
    name: 'profile',
    description: 'Sends a randomly selected profile for you',
    run: async (client, interaction, args) => {
    //await interaction.deferReply(); // Defer reply to allow time for processing

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

  
          // Create an embed with a reference to the attachment

          const exampleEmbed = new EmbedBuilder()
                  .setThumbnail(`https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${pfpurl}`)
                  .addFields(
                      { name: 'Your recommended **Profile Picture**', value: `[Download the Profile Picture](https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${pfpurl})` },
                      { name: '\u200B', value: '\u200B' },
                      { name: 'Your recommended **Profile Banner**', value: `[Download the Banner](https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${bannerurl})`, inline: true },
                      ///{ name: '\u200B', value: '\u200B', inline: true },
                  )
                  .setImage(`https://pub-d57423038d524235af4d68d744e4aaf2.r2.dev/${bannerurl}`)
                  .setTimestamp()
          
              interaction.followUp({ embeds: [exampleEmbed] });
      } catch (error) {
        console.error('Error fetching images:', error);
        await interaction.followUp('An error occurred while fetching images.');
      }
  },
};