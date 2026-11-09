const { AttachmentBuilder } = require("discord.js");
const fetch = require('node-fetch');

const config = require("../src/config/env");

module.exports = {
    name: "pinterest",
    description: "Search for aesthetic inspiration on Pinterest",
    options: [
        {
            name: "query",
            type: 3, // STRING
            description: "The aesthetic theme to search for (e.g., neon, cyberpunk)",
            required: true,
        }
    ],
    run: async (client, interaction, args) => {
        const query = interaction.options.getString("query");
        //await interaction.deferReply();

        const apiKey = config.search.serpApiKey;

        if (!apiKey) {
            return interaction.reply(
                "Pinterest search isn't configured on this instance. Set the " +
                "`SERPAPI_KEY` environment variable to enable it."
            );
        }

        try {
            const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=site:pinterest.com+${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;

            const response = await fetch(searchUrl);
            const data = await response.json();

            if (!data.images_results || data.images_results.length === 0) {
                return interaction.followUp("No aesthetic images found for that query.");
            }

            // Grab the first result
            const imageUrl = data.images_results[0].original;
            
            // Fetch the image buffer to send it as an attachment (keeps it clean)
            const imageResponse = await fetch(imageUrl);
            const buffer = await imageResponse.buffer();
            const attachment = new AttachmentBuilder(buffer, { name: 'aesthetic.jpg' });

            await interaction.followUp({
                content: `Here is your aesthetic inspiration for: **${query}**`,
                files: [attachment]
            });

        } catch (error) {
            console.error('Pinterest Search Error:', error);
            await interaction.followUp('An error occurred while searching Pinterest.');
        }
    }
};