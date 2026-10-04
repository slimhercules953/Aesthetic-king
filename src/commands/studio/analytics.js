const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getCreatorStats,
} = require("../../services/database/studioBridgeService");

const {
    buildBridgeEmbed,
    buildBridgeEmptyEmbed,
    formatTimestamp,
    studioFooterLink,
} = require("../../components/embeds/bridge");

/**
 * `/analytics` — the caller's creator statistics, in Discord.
 *
 * Gated on CREATOR_ANALYTICS via `requiredFeature`, which the interaction
 * pipeline enforces before `execute` runs. The gate is declared as a property
 * rather than checked inside `execute` for the same reason as
 * `requireGenerationChannel`: a command cannot ship without it, and the
 * ephemeral upsell has to be produced before the reply is deferred.
 *
 * The numbers are the Studio's, read from the same tables the dashboard's
 * analytics page uses, so the two never disagree. Only the caller's own rows
 * are reachable — there is no `user` option, because a creator's audience
 * figures are not something to look up about somebody else.
 *
 * Reach is a count of distinct people, not impressions, matching
 * `SharedPostView`'s one-row-per-viewer design: a refreshed tab must not be
 * able to invent an audience.
 */

const ANALYTICS_PATH = "/dashboard/analytics";

function buildAnalyticsEmbed(stats) {
    const headline = [
        {
            name: "Reach",
            value: `**${stats.reach}** viewer(s)`,
            inline: true,
        },
        {
            name: "Views",
            value: `**${stats.views}**`,
            inline: true,
        },
        {
            name: "Remixes",
            value: `**${stats.remixes}**`,
            inline: true,
        },
        {
            name: "Likes",
            value: `**${stats.likes}**`,
            inline: true,
        },
        {
            name: "Comments",
            value: `**${stats.comments}**`,
            inline: true,
        },
        {
            name: "Posts",
            value: `**${stats.postCount}**`,
            inline: true,
        },
    ];

    const context = [
        `**${stats.savedCount}** saved aesthetic(s) in your library.`,
        stats.recentPostCount > 0
            ? `**${stats.recentPostCount}** posted in the last 30 days.`
            : "Nothing posted in the last 30 days.",
        stats.oldestPostAt
            ? `First post ${formatTimestamp(stats.oldestPostAt)}.`
            : null,
    ].filter(Boolean);

    return buildBridgeEmbed({
        title: "\u{1F4C8} Your creator analytics",
        description: context.join("\n"),
        fields: headline,
        footer: studioFooterLink(ANALYTICS_PATH, "the full breakdown"),
    });
}

module.exports = {
    requiredFeature: "CREATOR_ANALYTICS",
    data: new SlashCommandBuilder()
        .setName("analytics")
        .setDescription(
            "Shows reach, views and remix counts for your published work."
        ),

    async execute(interaction) {
        /*
         * Deferred, but only after the pipeline's entitlement check has
         * already passed — an ephemeral upsell cannot be produced out of a
         * deferred reply, which is why the gate lives in the pipeline.
         */
        await interaction.deferReply({ ephemeral: true });

        const stats = await getCreatorStats(interaction.user.id);

        if (!stats || stats.postCount === 0) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmptyEmbed({
                        title: "\u{1F4C8} No statistics yet",
                        description:
                            "Analytics start once you publish something to Discover. " +
                            "Views are only counted for signed-in visitors other than you.",
                        studioPath: ANALYTICS_PATH,
                        studioLabel: "your analytics",
                    }),
                ],
            });

            return;
        }

        await interaction.editReply({
            embeds: [buildAnalyticsEmbed(stats)],
        });
    },
};