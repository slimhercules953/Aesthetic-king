const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} = require("discord.js");

const {
    getServerUsage,
} = require("../../services/database/studioBridgeService");

const {
    buildBridgeEmbed,
    buildBridgeEmptyEmbed,
    studioFooterLink,
} = require("../../components/embeds/bridge");

/**
 * `/serverstats` — this server's Aesthetic King usage, for its managers.
 *
 * Read-only, and permission-gated rather than premium-gated: the numbers are
 * the server's own aggregate usage, so the question is who may see them, not
 * who has paid. Anyone with Manage Guild can see them because that is exactly
 * the person who configures the bot in Server Studio; everyone else gets a
 * plain refusal.
 *
 * Only aggregates leave the database. The embed reports command totals and
 * member counts, never message content. Members are shown as mentions rather
 * than looked-up names: Discord renders the mention with the member's current
 * display name, which avoids needing the privileged guild members intent, and
 * renders a removed member as a placeholder instead of inventing a name.
 */

const SERVER_ANALYTICS_PATH = "/dashboard/servers";

function formatMember(entry) {
    const [discordUserId, hits] = entry;

    return `\`<@${discordUserId}>\` \u2014 ${hits}`;
}

function buildServerStatsEmbed(usage, guildName) {
    const fields = [
        {
            name: "Generations",
            value: `**${usage.totalEvents}**`,
            inline: true,
        },
        {
            name: "Members",
            value: `**${usage.uniqueMembers}**`,
            inline: true,
        },
        {
            name: "Premium",
            value: `**${usage.premiumEvents}**`,
            inline: true,
        },
    ];

    if (usage.topCommands.length > 0) {
        fields.push({
            name: "Top commands",
            value: usage.topCommands
                .map(
                    ([name, hits]) =>
                        `\`/${name}\` \u2014 ${hits}`
                )
                .join("\n"),
        });
    }

    if (usage.topMembers.length > 0) {
        fields.push({
            name: "Most active members",
            value: usage.topMembers.map(formatMember).join("\n"),
        });
    }

    return buildBridgeEmbed({
        title: `\u{1F4CA} ${guildName}`,
        description:
            `Usage in the last **${usage.days}** days.` +
            (usage.busiestDay
                ? `\nBusiest day: **${usage.busiestDay[0]}** (${usage.busiestDay[1]} generations).`
                : ""),
        fields,
        color: 0x22c55e,
        footer: studioFooterLink(
            `${SERVER_ANALYTICS_PATH}/${usage.guildId}/analytics`,
            "Server Analytics"
        ),
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription(
            "Shows this server's Aesthetic King usage. Managers only."
        )
        .addIntegerOption((option) =>
            option
                .setName("days")
                .setDescription("How far back to look (1-90).")
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(90)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    async execute(interaction) {
        /*
         * defaultMemberPermissions hides the command from non-managers in
         * Discord's picker, but that is a UI filter, not enforcement: an older
         * client or a direct API call can still send the interaction. The
         * runtime check is the actual gate.
         */
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
                content:
                    "\u{1F512} Only members who can manage this server can see its Aesthetic King stats.",
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        const days =
            interaction.options.getInteger("days") ?? 30;

        await interaction.deferReply({ ephemeral: true });

        const usage = await getServerUsage(
            interaction.guildId,
            { days }
        );

        if (usage.totalEvents === 0) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmptyEmbed({
                        title: "\u{1F4CA} No usage recorded yet",
                        description:
                            `No Aesthetic King commands have been used here in the last ${days} day(s).`,
                        studioPath: `${SERVER_ANALYTICS_PATH}/${interaction.guildId}/analytics`,
                        studioLabel: "Server Analytics",
                    }),
                ],
            });

            return;
        }

        await interaction.editReply({
            embeds: [
                buildServerStatsEmbed(
                    { ...usage, guildId: interaction.guildId },
                    interaction.guild?.name ?? "This server"
                ),
            ],
        });
    },
};