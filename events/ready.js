const client = require("../index");  // Importing the client from index.js
const { Client, Events, ActivityType } = require('discord.js');

const { REST, Routes } = require('discord.js');

const TOKEN = process.env.TOKEN

const rest = new REST().setToken(TOKEN);

// Combined 'ready' event listener for the Discord client
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    client.user.setActivity('users paint the world with kindness', { type: ActivityType.Watching });
});

// Run the following code if guild commands get added on accident or on purpose
// (async () => {
//     try {
//       console.log('[INFO] Fetching guild commands...');
      
//       // Fetch all guild commands
//       const commands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
  
//       if (!commands.length) {
//         console.log('[INFO] No guild commands to delete.');
//         return;
//       }
  
//       console.log(`[INFO] Found ${commands.length} commands. Deleting...`);
  
//       // Delete each command
//       for (const command of commands) {
//         console.log(`[INFO] Deleting command: ${command.name} (ID: ${command.id})`);
//         await rest.delete(Routes.applicationGuildCommand(clientId, guildId, command.id));
//       }
  
//       console.log('[INFO] Successfully deleted all guild commands.');
//     } catch (error) {
//       console.error('[ERROR] Failed to delete guild commands:', error);
//     }
//   })();