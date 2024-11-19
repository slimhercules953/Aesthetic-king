const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });
require('dotenv').config();


module.exports = client;


// Global Variables
client.commands = new Collection();
client.slashCommands = new Collection();

// Initializing the project
require("./handler")(client);
client.login(process.env.TOKEN)
