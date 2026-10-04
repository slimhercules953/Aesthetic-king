const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    findPublishedPosts,
    getRemixablePost,
} = require("../../services/database/studioBridgeService");

const {
    buildBridgeEmbed,
    buildBridgeEmptyEmbed,
    formatPalette,
    formatTimestamp,
    formatAuthor,
    studioFooterLink,
} = require("../../components/embeds/bridge");

const {
    buildStudioLink,
} = require("../../components/embeds/premiumLocked");

/**
 * `/remix` — shows what a published post is made of, and where to remix it.
 *
 * This command deliberately does not create anything. Remixing writes a
 * SavedAesthetic row with provenance columns, checks the remixing user's
 * premium entitlement, and bumps the original author's analytics; all of that
 * already exists in `studio/lib/remix.ts` behind the session, CSRF and
 * ownership checks of `/api/feed/[id]/remix`. Reimplementing it in the bot
 * would mean a second copy of those rules that could drift, so the bot instead
 * answers the question a person in a channel actually has ("what colours are
 * in that, and who made it?") and hands off the one click that writes.
 *
 * Only published posts are searchable. Another account's private saved
 * aesthetics cannot be reached by guessing a name, which is the reason this
 * command queries SharedPost rather than SavedAesthetic.
 */

const DISCOVER_PATH = "/dashboard/discover";

function buildRemixEmbed({
    post,
    palette,
    remixCount,
    resolvable,
}) {
    const fields = [];

    const colors = formatPalette(palette);

    if (colors) {
        fields.push({
            name: "Palette",
            value: colors,
        });
    }

    if (post.caption) {
        fields.push({
            name: "Caption",
            value: post.caption.slice(0, 300),
        });
    }

    if (post.tags.length > 0) {
        fields.push({
            name: "Tags",
            value: post.tags
                .slice(0, 8)
                .map((tag) => `\`#${tag}\``)
                .join(" "),
        });
    }

    fields.push({
        name: "Reception",
        value:
            `\u2764 ${post.likeCount} \u2022 \u{1F4AC} ${post.commentCount}` +
            ` \u2022 remixed ${remixCount} time(s)\n` +
            `published ${formatTimestamp(post.createdAt)}`,
        inline: false,
    });

    const author = formatAuthor(post.user);
    const profileUrl = buildStudioLink(`/u/${post.user?.discordId}`);

    const description = resolvable
        ?
            `From ${profileUrl ? `**[${author}](${profileUrl})**` : `**${author}**`}.` +
            "\n\nOpen the feed and press **Remix** on this card to copy it into your own library with credit attached."
        :
            `From ${profileUrl ? `**[${author}](${profileUrl})**` : `**${author}**`}.` +
            "\n\nThis post is a " +
            `${String(post.itemType).toLowerCase()}, which the Studio remixes ` +
            "from the item's own page rather than from the feed.";

    return buildBridgeEmbed({
        title: `\u{1F501} ${post.itemType} \u2014 ${post.itemId}`,
        description,
        fields,
        footer: studioFooterLink(DISCOVER_PATH, "the feed"),
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("remix")
        .setDescription(
            "Shows a published post's palette and where to remix it in Studio."
        )
        .addStringOption((option) =>
            option
                .setName("post")
                .setDescription(
                    "A post id from the feed, or words from its caption or a tag."
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        const query = interaction.options.getString("post", true);

        await interaction.deferReply();

        const matches = await findPublishedPosts(query);

        if (matches.length === 0) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmptyEmbed({
                        title: "\u{1F501} Nothing matched that",
                        description:
                            `No published post matches **${query.slice(0, 60)}**. ` +
                            "Only posts people have published to Discover can be remixed.",
                        studioPath: DISCOVER_PATH,
                        studioLabel: "the feed",
                    }),
                ],
            });

            return;
        }

        /*
         * An exact id match returns one row and gets the full palette view.
         * A text match can return several, and guessing which one the user
         * meant would produce a confident-looking wrong answer, so the list is
         * shown and the id is printed for the follow-up.
         */
        if (matches.length > 1) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmbed({
                        title: "\u{1F501} Several posts matched",
                        description:
                            "Run `/remix` again with one of these post ids:",
                        fields: matches.map((post, index) => ({
                            name: `${index + 1}. ${post.itemType.toLowerCase()}`,
                            value:
                                `\`${post.id}\`\n` +
                                (post.caption
                                    ? post.caption.slice(0, 80)
                                    : `by ${formatAuthor(post.user)}`),
                        })),
                        footer: studioFooterLink(
                            DISCOVER_PATH,
                            "the feed"
                        ),
                    }),
                ],
            });

            return;
        }

        const detail = await getRemixablePost(matches[0].id);

        if (!detail) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmptyEmbed({
                        title: "\u{1F501} That post is gone",
                        description:
                            "The author unshared it between the search and now.",
                        studioPath: DISCOVER_PATH,
                        studioLabel: "the feed",
                    }),
                ],
            });

            return;
        }

        await interaction.editReply({
            embeds: [buildRemixEmbed(detail)],
        });
    },
};