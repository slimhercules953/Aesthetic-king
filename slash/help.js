const { EmbedBuilder } = require('discord.js')
const fs = require("fs");

module.exports = {
    name: "help",
    description: "Sends a help command that displays the currently available commands",
    options: [], // Add options if needed
    run: async (client, interaction, args) => {
        const usernameofperson = interaction.user
        const guildIconURL = interaction.guild?.iconURL({ dynamic: true, size: 1024 });
        const command = []
        //const slashFiles = await getFiles(path.join(process.cwd(), "slash"), ".js");
        const commandFiles = fs.readdirSync(`./slash/${command}`).filter(file => file.endsWith(`.js`))
        for(files in commandFiles){
            commandFiles[files] = commandFiles[files].slice(0, -3)
        }
        const description = "```" + Object.entries(commandFiles)
            .map(([key, value]) => `${value}`)
            .join(", ") + "```";
        const exampleEmbed = new EmbedBuilder()
            .setThumbnail(usernameofperson.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setAuthor({
                name: `${client.user.tag}'s Help`,
                iconURL: guildIconURL || client.user.displayAvatarURL()
            })
            .setTimestamp()
            .setColor("DarkButNotBlack")
        
            exampleEmbed.setDescription(`These are the available commands for ${client.user.tag}\nThe bot uses slash commands as prefix commands are now deprecated.\n${description}\n\nHere is the support server link: [Authentic Aesthetics](<https://discord.gg/gWVNterjmH>)`)
            //exampleEmbed.setFooter(`${client.user.tag} | Total commands ${client.commands.size}`)
        interaction.followUp({ embeds: [exampleEmbed]})
    }
}