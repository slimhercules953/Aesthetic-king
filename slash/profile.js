const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../src/config/env');

// Configure AWS SDK for Cloudflare R2. The endpoint and public URL come
// from configuration so the Cloudflare account ID stays out of source.
if (!config.r2.endpoint) {
  throw new Error('R2_ACCOUNT_ID (or R2_ENDPOINT) is not configured.');
}

const r2 = new S3Client({
  endpoint: config.r2.endpoint,
  region: 'auto',
  credentials: {
    accessKeyId: config.r2.accessKeyId || process.env.r2accesskey, // Your R2 access key
    secretAccessKey: config.r2.secretAccessKey || process.env.r2SAK,  // Your R2 secret key
  },
});

const bucketName = config.r2.bucketName || 'aesthetic-king'; // Replace with your R2 bucket name

// Public bucket URLs also embed the account ID, so they come from
// R2_PUBLIC_URL rather than being written into source.
if (!config.r2.publicUrl) {
  throw new Error('R2_PUBLIC_URL is not configured.');
}

const publicBaseUrl = config.r2.publicUrl.replace(/\/+$/, '');
const publicUrl = (key) => `${publicBaseUrl}/${key}`;

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
                  .setThumbnail(publicUrl(pfpurl))
                  .addFields(
                      { name: 'Your recommended **Profile Picture**', value: `[Download the Profile Picture](${publicUrl(pfpurl)})` },
                      { name: '\u200B', value: '\u200B' },
                      { name: 'Your recommended **Profile Banner**', value: `[Download the Banner](${publicUrl(bannerurl)})`, inline: true },
                      ///{ name: '\u200B', value: '\u200B', inline: true },
                  )
                  .setImage(publicUrl(bannerurl))
                  .setTimestamp()
          
              interaction.followUp({ embeds: [exampleEmbed] });
      } catch (error) {
        console.error('Error fetching images:', error);
        await interaction.followUp('An error occurred while fetching images.');
      }
  },
};