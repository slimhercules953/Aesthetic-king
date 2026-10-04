const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getDiscoverPosts,
    countFeedPosts,
} = require("../../services/database/studioBridgeService");

const {
    buildBridgeEmbed,
    buildBridgeEmptyEmbed,
    formatAuthor,
    formatPostLine,
    formatTimestamp,
    studioFooterLink,
} = require("../../components/embeds/bridge");

const {
    buildStudioLink,
} = require("../../components/embeds/premiumLocked");

/**
 * `/discover` — a peek at the Studio's public feed.
 *
 * Strictly read-only, and that is the whole design. The bot never likes,
 * comments, remixes or publishes: those actions need the Studio's session
 * cookies, CSRF checks and ownership rules, and reproducing them in a slash
 * command would mean a second, weaker copy of the same authorization code.
 * Anything that changes data happens on the site; the bot points at it.
 *
 * The reply is public on purpose. The feed is already public, and a command
 * that shows other people what is worth looking at is how the feed gets an
 * audience. Nothing private is in the embed: only posts their authors chose to
 * publish, plus the author's display name.
 */

const DISCOVER_PATH = "/dashboard/discover";

function buildDiscoverEmbed(posts, sort, feedSize) {
    const fields = posts.map((post, index) => {
        const profileUrl = buildStudioLink(
            `/u/${post.user?.discordId}`
        );

        const author = formatAuthor(post.user);

        return {
            name: `${index + 1}. ${sort === "popular" ? "\u2764" : "\u{1F552}"} ${String(post.itemType).toLowerCase()}`,
            value:
                formatPostLine(post, { index: index + 1, showAuthor: false }) +
                `\nby ${profileUrl ? `[${author}](${profileUrl})` : `**${author}**`} \u2022 \u2764 ${post.likeCount} \u2022 \u{1F4AC} ${post.commentCount} \u2022 ${formatTimestamp(post.createdAt)}`,
        };
    });

    const total = feedSize.capped
        ? `${feedSize.probe}+`
        : `${feedSize.count}`;

    return buildBridgeEmbed({
        title:
            sort === "popular"
                ? "\u{1F30D} Most liked on Discover"
                : "\u{1F30D} New on Discover",
        description:
            `${fields.length} of **${total}** published posts.\n\n` +
            "Tap a creator's name to see their public profile.",
        fields,
        footer: studioFooterLink(DISCOVER_PATH, "the full feed"),
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("discover")
        .setDescription(
            "Shows recent or most-liked posts from the Aesthetic King feed."
        )
        .addStringOption((option) =>
            option
                .setName("sort")
                .setDescription("Which posts to show.")
                .setRequired(false)
                .addChoices(
                    { name: "New", value: "new" },
                    { name: "Most liked", value: "popular" }
                )
        ),

    async execute(interaction) {
        const sort =
            interaction.options.getString("sort") ?? "new";

        await interaction.deferReply();

        const [posts, feedSize] = await Promise.all([
            getDiscoverPosts(sort),
            countFeedPosts(),
        ]);

        if (posts.length === 0) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmptyEmbed({
                        title: "\u{1F30D} The feed is empty",
                        description:
                            "Nobody has published anything to Discover yet. Publish a saved aesthetic from Studio and it shows up here.",
                        studioPath: DISCOVER_PATH,
                        studioLabel: "the feed",
                    }),
                ],
            });

            return;
        }

        await interaction.editReply({
            embeds: [
                buildDiscoverEmbed(posts, sort, feedSize),
            ],
        });
    },
};