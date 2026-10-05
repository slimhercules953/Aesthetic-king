const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require("discord.js");

const config = require("../../config/env");

/**
 * `/vote` — where to vote for the bot, and what a vote is worth.
 *
 * Ported from the v1 `slash/vote.js`, which was never installed: the v2
 * deploy script reads `src/commands/`, so that file was dead code and the
 * command simply did not exist on the live bot.
 *
 * Two differences from the old version beyond the module shape. It names the
 * Crown reward, because a vote that pays 10 Crowns gets voted for and one
 * that pays nothing mentioned does not — and it only lists sites that are
 * actually wired up on this deployment, so nobody is sent to vote for a
 * reward that never arrives.
 *
 * The reply is public on purpose, the same reasoning as `/premium`: one
 * person voting advertises the bot to everyone watching.
 */

/**
 * Crowns per counted vote, mirroring `CROWN_EARN_RULES` in
 * `studio/lib/crownEarning.ts`. Kept as a literal rather than imported
 * because the Studio is a separate TypeScript bundle the bot cannot require;
 * `testCommands.js` does not check it, so change both sides together.
 */
const CROWNS_PER_VOTE = 10;

function buildVoteEmbed(client) {
    const sites = [];

    if (config.voting.topgg) {
        sites.push(`• **[Top.gg](${config.voting.topgg})**`);
    }

    if (config.voting.chime) {
        sites.push(`• **[Chime](${config.voting.chime})**`);
    }

    const embed = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("Vote for Aesthetic King")
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({
            text: "Thank you for the support ❤️",
        });

    /*
     * No listing configured at all. Saying so beats an embed with an empty
     * bullet list, and it is honest about the state of the deployment.
     */
    if (sites.length === 0) {
        embed.setDescription(
            "Voting links aren't configured yet, so there's nowhere to " +
            "vote from here right now."
        );

        return embed;
    }

    embed.setDescription(
        `Voting helps more servers find the bot, and every counted vote ` +
        `pays **${CROWNS_PER_VOTE} Crowns** to your account — up to once a ` +
        `day.\n\n${sites.join("\n")}\n\n` +
        "Crowns land automatically if you've signed into the Studio with " +
        "this Discord account. Spend them on the Earn page."
    );

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("vote")
        .setDescription(
            "Shows where to vote for Aesthetic King and what a vote pays."
        ),

    async execute(interaction) {
        await interaction.reply({
            embeds: [buildVoteEmbed(interaction.client)],
        });
    },
};
