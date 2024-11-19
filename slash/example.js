module.exports = {
    name: "example",
    description: "An example command",
    options: [], // Add options if needed
    run: async (client, interaction, args) => {
      await interaction.followUp("This is an example response!");
    },
  }