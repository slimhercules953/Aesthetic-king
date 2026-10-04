const {
    SlashCommandBuilder,
} = require("discord.js");

const {
    getSavedLibrary,
    getMySharedPosts,
    MAX_LIST_ROWS,
} = require("../../services/database/studioBridgeService");

const {
    buildBridgeEmbed,
    buildBridgeEmptyEmbed,
    formatPalette,
    formatAestheticName,
    formatTimestamp,
    truncate,
    studioFooterLink,
} = require("../../components/embeds/bridge");

/**
 * `/saved` — the caller's own Studio library, from Discord.
 *
 * Always ephemeral and always about the person running the command: a saved
 * aesthetic is private work, so unlike /discover this reply is never public
 * and there is no `user` option to look somebody else up. The only id used is
 * `interaction.user.id`.
 *
 * Read-only by design. Editing, renaming and deleting need the Studio's
 * session and ownership checks, so the embed links to the page that does it.
 */

const AESTHETICS_PATH = "/dashboard/aesthetics";

function describeAesthetic(aesthetic) {
    const lines = [
        `**${truncate(aesthetic.name, 60)}**`,
    ];

    const style = formatAestheticName(aesthetic.aestheticId);

    if (style) {
        lines.push(`style: ${style}`);
    }

    const palette = formatPalette(aesthetic.palette);

    if (palette) {
        lines.push(palette);
    }

    if (aesthetic.usernameIdea) {
        lines.push(`username: ${truncate(aesthetic.usernameIdea, 40)}`);
    }

    lines.push(`updated ${formatTimestamp(aesthetic.updatedAt)}`);

    return lines.join("\n");
}

function describePalette(palette) {
    const lines = [
        `**${truncate(palette.name, 60) || "Untitled palette"}**`,
    ];

    const colors = formatPalette(palette.colors);

    if (colors) {
        lines.push(colors);
    }

    lines.push(`updated ${formatTimestamp(palette.updatedAt)}`);

    return lines.join("\n");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("saved")
        .setDescription(
            "Lists your saved aesthetics and palettes from Aesthetic King Studio."
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const [library, posts] = await Promise.all([
            getSavedLibrary(interaction.user.id),
            getMySharedPosts(interaction.user.id),
        ]);

        if (
            library.aesthetics.length === 0 &&
            library.palettes.length === 0 &&
            library.profileCount === 0
        ) {
            await interaction.editReply({
                embeds: [
                    buildBridgeEmptyEmbed({
                        title: "\u{1F4D2} Nothing saved yet",
                        description:
                            "Your Studio library is empty. Generate an aesthetic and save it, then come back here.",
                        studioPath: AESTHETICS_PATH,
                        studioLabel: "your aesthetics",
                    }),
                ],
            });

            return;
        }

        const fields = [];

        if (library.aesthetics.length > 0) {
            fields.push({
                name: `\u{1F3A8} Saved aesthetics (${library.aesthetics.length})`,
                value: library.aesthetics
                    .slice(0, 5)
                    .map(describeAesthetic)
                    .join("\n\n"),
            });
        }

        if (library.palettes.length > 0) {
            fields.push({
                name: `\u{1F308} Saved palettes (${library.palettes.length})`,
                value: library.palettes
                    .slice(0, 5)
                    .map(describePalette)
                    .join("\n\n"),
            });
        }

        const truncated =
            library.aesthetics.length >= MAX_LIST_ROWS ||
            library.palettes.length >= MAX_LIST_ROWS;

        const summary = [
            library.profileCount > 0
                ? `**${library.profileCount}** profile(s) in the Builder`
                : null,
            posts.length > 0
                ? `**${posts.length}** post(s) published to Discover`
                : null,
            truncated
                ? `Showing the ${MAX_LIST_ROWS} most recent of each.`
                : null,
        ].filter(Boolean);

        await interaction.editReply({
            embeds: [
                buildBridgeEmbed({
                    title: "\u{1F4D2} Your Studio library",
                    description:
                        summary.length > 0
                            ? summary.join("\n")
                            : null,
                    fields,
                    footer: studioFooterLink(
                        AESTHETICS_PATH,
                        "your library"
                    ),
                }),
            ],
        });
    },
};