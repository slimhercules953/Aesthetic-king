const fs = require("fs");
const path = require("path");
const { Client } = require("discord.js");

/**
 * Recursively reads a directory and returns all file paths matching a specific extension.
 * @param {string} dir The directory to read.
 * @param {string} extension The file extension to filter by (e.g., ".js").
 * @returns {Promise<string[]>} A promise resolving to an array of file paths.
 */
const getFiles = async (dir, extension) => {
  const files = await fs.promises.readdir(dir, { withFileTypes: true });
  const jsFiles = [];

  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      // Recurse into subdirectories
      const subFiles = await getFiles(filePath, extension);
      jsFiles.push(...subFiles);
    } else if (file.isFile() && file.name.endsWith(extension)) {
      jsFiles.push(filePath);
    }
  }

  return jsFiles;
};

/**
 * @param {Client} client
 */
module.exports = async (client) => {

  // Commands
  const commandFiles = await getFiles(path.join(process.cwd(), "slash"), ".js");

  commandFiles.map((value) => {
    const file = require(value);
    const directory = path.basename(path.dirname(value)); // Gets the parent directory name

    // if (file.name) {
    //   const properties = { directory, ...file };
    //   client.commands.set(file.name, properties);
  //   }
  });

  // Events
  const eventFiles = await getFiles(path.join(process.cwd(), "events"), ".js");
  // Example: Load and register event files
  for (const file of eventFiles) {
  const event = require(file);  // Require the event file

  // Assuming each event file exports a function to register the event handler
    if (event.name && event.run) {
      client.on(event.name, event.run.bind(null, client));
    }
  }

  // Slash Commands
  const slashFiles = await getFiles(path.join(process.cwd(), "slash"), ".js");

  const arrayOfSlashCommands = [];
  slashFiles.map((value) => {
    const file = require(value);
    
    client.slashCommands.set(file.name, file);

    if (["MESSAGE", "USER"].includes(file.type)) {
      delete file.description;
    }
    arrayOfSlashCommands.push(file);
  });

  client.on("ready", async () => {
    try {
        // Register globally
        await client.application.commands.set(arrayOfSlashCommands);
    } catch (error) {
        console.error("An error has occured", error); // Error
    }
});
};
