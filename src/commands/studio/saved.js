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

/**
 * How many rows a single section tries to show before moving to a new field.
 *
 * An embed field caps out at 1024 characters and five fully-populated rows can
 * exceed that (a 60-character name, six hex codes and a 40-character username
 * idea is roughly 180 characters each), so rows are packed into as many fields
 * as they need instead of being blindly joined into one.
 */
const ROWS_PER_SECTION = 5;
const MAX_FIELD_LENGTH = 1024;
const SEPARATOR = "\n\n";

/**
 * Greedy-packs formatted rows into field values that each fit Discord's
 * 1024-character limit. A single oversized row is truncated rather than
 * dropped, so the reply always describes at least what it found.
 */
function packRows(rows) {
    const chunks = [];
    let current = "";

    for (const row of rows) {
        const candidate = current ? `${current}${SEPARATOR}${row}` : row;

        if (candidate.length <= MAX_FIELD_LENGTH) {
            current = candidate;
            continue;
        }

        if (current) {
            chunks.push(current);
            current = row;
        } else {
            chunks.push(row.slice(0, MAX_FIELD_LENGTH - 1).concat("\u2026"));
            current = "";
        }
    }

    if (current) {
        chunks.push(current);
    }

    return chunks.length > 0 ? chunks : ["\u200b"];
}

/**
 * Turns one section's rows into embed fields: the first carries the heading,
 * any overflow fields use a zero-width name so the embed still reads as one
 * continuous list.
 */
function buildSectionFields(heading, rows) {
    if (rows.length === 0) {
        return [];
    }

    return packRows(rows).map((value, index) => ({
        name: index === 0 ? heading : "\u200b",
        value,
    }));
}

function describeAesthetic(aesthetic) {
    const lines = [
        `**${truncate(aesthetic.name, 60)}**`,
    ];

    const style = formatAestheticName(aesthetic.aestheticId);

    if (style) {
        lines.push(`style: ${style}`);
    }

    /*
     * No swatch line here. /saved stacks up to five aesthetics and five
     * palettes in one embed, and a square emoji per colour costs a line each —
     * which for the dark, near-monochrome palettes this product mostly
     * produces is five identical blocks that say nothing the hex codes below
     * don't. Single-item views like /remix keep the swatches.
     */
    const palette = formatPalette(aesthetic.palette, { showSwatches: false });

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

    const colors = formatPalette(palette.colors, { showSwatches: false });

    if (colors) {
        lines.push(colors);
    }

    lines.push(`updated ${formatTimestamp(palette.updatedAt)}`);

    return lines.join("\n");
}

module.exports = {
    /*
     * Exported for scripts/testCommands.js, which asserts that oversized rows
     * are split across fields instead of blowing the 1024-character limit, and
     * that a row stays as compact as the /saved layout promises.
     */
    packRows,
    buildSectionFields,
    describeAesthetic,
    describePalette,

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

        const fields = [
            ...buildSectionFields(
                `\u{1F3A8} Saved aesthetics (${library.aesthetics.length})`,
                library.aesthetics
                    .slice(0, ROWS_PER_SECTION)
                    .map(describeAesthetic)
            ),
            ...buildSectionFields(
                `\u{1F308} Saved palettes (${library.palettes.length})`,
                library.palettes
                    .slice(0, ROWS_PER_SECTION)
                    .map(describePalette)
            ),
        ];

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