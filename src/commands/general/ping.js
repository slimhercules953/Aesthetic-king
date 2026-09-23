const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Checks whether Aesthetic King is online."),

    async execute(interaction) {
        const sent = await interaction.reply({
            content: "Pinging...",
            fetchReply: true,
        });

        const roundTripLatency =
            sent.createdTimestamp - interaction.createdTimestamp;

        const websocketLatency = Math.round(
            interaction.client.ws.ping
        );

        await interaction.editReply({
            content:
                `🏓 **Pong!**\n` +
                `Round-trip: **${roundTripLatency}ms**\n` +
                `WebSocket: **${websocketLatency}ms**`,
        });
    },
};