const {
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");

const config = require("../../config/env");

/**
 * The "you need Premium" embed.
 *
 * The Studio's version of this moment is a whole locked page with a
 * crown badge and an upgrade button. A Discord embed cannot sell that
 * hard, so this keeps the two things that matter: what is locked, and
 * where to unlock it. Prices are not repeated here — Crown costs live
 * in `studio/lib/features.ts` and are shown on the Premium page, so
 * quoting them in the bot would create a second number to forget to
 * update.
 */

const PREMIUM_PAGE_PATH = "/dashboard/premium";
const ASSETS_PAGE_PATH = "/dashboard/assets";

function getStudioBaseUrl() {
    return config.studio.url;
}

function buildStudioLink(path) {
    const base = getStudioBaseUrl();

    return base
        ? `${base}${path}`
        : null;
}

function studioLine(path, label) {
    const url = buildStudioLink(path);

    return url
        ? `Unlock it on your [${label}](${url}).`
        : `Unlock it in Aesthetic King Studio (**${path}**).`;
}

function buildPremiumLockedEmbed({
    title = "Premium Feature",
    description,
    footer = "Aesthetic King • Premium",
}) {
    return new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle(`👑 ${title}`)
        .setDescription(description)
        .setFooter({ text: footer });
}

/**
 * Shown when every set matching the user's filters is premium, so
 * there is genuinely nothing left to offer a free user.
 */
function buildPremiumAssetsLockedEmbed({
    filterDisplay = null,
    footer = "Aesthetic King • Premium Assets",
} = {}) {
    const matched = filterDisplay
        ? `Every profile set matching **${filterDisplay}** is part of the premium library.\n\n`
        : "The profile set library is part of the premium library.\n\n";

    return buildPremiumLockedEmbed({
        title: "Premium Assets Required",
        description:
            matched +
            "Premium Assets unlocks the full PFP and banner library, " +
            "and can be bought with Crowns or with Premium.\n\n" +
            studioLine(ASSETS_PAGE_PATH, "premium asset library") +
            "\nBrowse everything, then unlock what you want to use.",
        footer,
    });
}

/**
 * Shown when a command is gated outright rather than filtered.
 */
function buildFeatureLockedEmbed(featureLabel, path = PREMIUM_PAGE_PATH) {
    return buildPremiumLockedEmbed({
        title: `${featureLabel} is a Premium feature`,
        description:
            `**${featureLabel}** is part of Aesthetic King Premium. ` +
            "You can unlock it with Crowns or with a Premium subscription.\n\n" +
            studioLine(path, "Premium page"),
    });
}

/**
 * Wraps a locked embed into a complete reply payload.
 *
 * Every "you need Premium" message is ephemeral: the upsell is between the
 * bot and the person who hit the lock, and a public one singles out anyone
 * using the free tier. Discord fixes ephemerality when the reply is sent, so
 * callers must evaluate the entitlement check *before* deferring — an
 * ephemeral response cannot be produced out of an already-deferred public one.
 *
 * @param {import("discord.js").EmbedBuilder} embed
 * @returns {import("discord.js").BaseMessageOptions}
 */
function buildPremiumLockedReply(embed) {
    return {
        embeds: [embed],
        components: [],
        flags: MessageFlags.Ephemeral,
    };
}

module.exports = {
    PREMIUM_PAGE_PATH,
    ASSETS_PAGE_PATH,

    buildStudioLink,
    buildPremiumLockedEmbed,
    buildPremiumAssetsLockedEmbed,
    buildFeatureLockedEmbed,
    buildPremiumLockedReply,
};
