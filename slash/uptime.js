module.exports = {
  name: "uptime",
  description: "Let's you know how long the bot has been online since it has been restarted",
  options: [], // Add options if needed
  run: async (client, interaction, args) => {    let totalSec = (client.uptime / 1000)
    let days = Math.floor(totalSec / 86400)
    totalSec %= 86400
    let hours = Math.floor(totalSec / 3600)
    totalSec %= 3600
    let minutes = Math.floor(totalSec / 60)
    let seconds = Math.floor(totalSec % 60)
    let uptime = `**${days}** days, **${hours}** hours, **${minutes}** minutes, **${seconds}** seconds`
    interaction.followUp({ content: uptime })
  }
}