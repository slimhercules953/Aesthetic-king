const {
    EmbedBuilder,
} = require("discord.js");

const {
    buildStudioLink,
} = require("./premiumLocked");

const {
    getAesthetic,
} = require("../../data/aesthetics");

/**
 * Embeds for the Studio bridge commands (/discover, /saved, /remix,
 * /analytics, /serverstats).
 *
 * These commands exist so somebody in a Discord channel can see what lives in
 * their Studio account without leaving Discord. They are read-only views, and
 * the embeds are written to say so: each one ends with a link to the Studio
 * page where the same thing can actually be edited.
 *
 * The formatting rules are shared here because five commands would otherwise
 * each invent their own way to render a palette or a "nothing here yet" state,
 * and the point of a bridge is that it looks like one feature rather than five
 * scripts.
 */

const SWATCH = "\u{1F7E5}";

const BRIDGE_FOOTER = "Aesthetic King \u2022 Studio";

/**
 * Renders up to six hex colours as a line of coloured squares.
 *
 * Discord has no colour swatches in embed fields, so the emoji block is the
 * closest thing that survives on every client. The hex codes are printed
 * underneath because a square is pretty but not copy-pasteable, and the reason
 * most people ask a bot for a palette is to paste it somewhere.
 */
function formatPalette(colors, { max = 6, showHex = true } = {}) {
    const list = Array.isArray(colors)
        ? colors.filter((color) => typeof color === "string" && color.trim())
        : [];

    if (list.length === 0) {
        return null;
    }

    const shown = list.slice(0, max);
    const swatches = shown.map(() => SWATCH).join("");

    if (!showHex) {
        return swatches;
    }

    return `${swatches}\n${shown.join(" ")}`;
}

/**
 * Turns a stored aesthetic id into its display name.
 *
 * Falls back to the raw id: a Pack's aesthetic id may not be in the built-in
 * catalogue, and printing "Unknown" would hide something the user can read.
 */
function formatAestheticName(aestheticId) {
    if (!aestheticId) {
        return null;
    }

    return getAesthetic(aestheticId)?.name ?? aestheticId;
}

/**
 * A Discord timestamp token, so dates render in each viewer's timezone.
 */
function formatTimestamp(date) {
    if (!date) {
        return null;
    }

    const ms =
        date instanceof Date
            ? date.getTime()
            : new Date(date).getTime();

    return Number.isNaN(ms)
        ? null
        : `<t:${Math.floor(ms / 1000)}:R>`;
}

/**
 * Trims text to a single line for use in a field value.
 */
function truncate(text, max = 90) {
    const clean = String(text ?? "")
        .replace(/\s+/g, " ")
        .trim();

    if (!clean) {
        return null;
    }

    return clean.length > max
        ? `${clean.slice(0, max - 1)}\u2026`
        : clean;
}

/**
 * The Studio link every bridge embed carries.
 *
 * When STUDIO_URL is unset the line degrades to the bare path, so the commands
 * still work in a local dev bot; they just cannot make the path clickable.
 */
function studioFooterLink(path, label) {
    const url = buildStudioLink(path);

    return url
        ? `Open ${label} in Studio: ${url}`
        : `Manage this in Aesthetic King Studio (**${path}**).`;
}

function buildBridgeEmbed({
    title,
    description = null,
    fields = [],
    color = 0x7c5cff,
    footer = BRIDGE_FOOTER,
}) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title);

    if (description) {
        embed.setDescription(description);
    }

    if (fields.length > 0) {
        embed.addFields(fields);
    }

    embed.setFooter({ text: footer });

    return embed;
}

/**
 * The "you have nothing here yet" embed.
 *
 * Every bridge command can hit this state, and the useful part is always the
 * same: what to do first, and where to do it.
 */
function buildBridgeEmptyEmbed({
    title,
    description,
    studioPath,
    studioLabel,
}) {
    return buildBridgeEmbed({
        title,
        description: `${description}\n\n${studioFooterLink(studioPath, studioLabel)}`,
        color: 0x8b5cf6,
    });
}

/**
 * Names the author of a published post, preferring the display name.
 */
function formatAuthor(user) {
    if (!user) {
        return "Unknown creator";
    }

    return (
        user.displayName ||
        user.username ||
        "Unknown creator"
    );
}

/**
 * One line describing a feed post: what it is, who made it, how it did.
 *
 * Shared by /discover, /remix and /myfeed so the same post reads identically
 * wherever it appears.
 */
function formatPostLine(post, { index = null, showAuthor = true } = {}) {
    const prefix = index === null
        ? ""
        : `**${index}.** `;

    const title =
        truncate(post.caption, 60) ||
        `${String(post.itemType).toLowerCase()} \u2014 ${post.itemId}`;

    const bits = [
        `${prefix}**${title}**`,
        showAuthor
            ? `by ${formatAuthor(post.user)}`
            : null,
        `\u2764 ${post.likeCount}`,
        `\u{1F4AC} ${post.commentCount}`,
    ].filter(Boolean);

    return bits.join(" \u2022 ");
}

module.exports = {
    SWATCH,
    BRIDGE_FOOTER,
    formatPalette,
    formatAestheticName,
    formatTimestamp,
    truncate,
    studioFooterLink,
    formatAuthor,
    formatPostLine,
    buildBridgeEmbed,
    buildBridgeEmptyEmbed,
};