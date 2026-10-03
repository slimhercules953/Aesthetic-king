const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require("discord.js");

const {
    getPremiumStatus,
} = require("../../services/entitlements/premiumStatusService");

const {
    PREMIUM_PAGE_PATH,
    buildStudioLink,
} = require("../../components/embeds/premiumLocked");

/**
 * `/premium` — a read-only mirror of the user's Studio premium status.
 *
 * Everything about buying happens in Studio. This command exists because
 * the most common question aimed at the bot is "why is this locked for
 * me?", and answering it needs the plan, the Crown balance, and which
 * unlocks are still live. It reports; it never spends.
 */

function formatExpiry(date) {
    const ms = date.getTime() - Date.now();

    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor(
        (ms % 86_400_000) / 3_600_000
    );

    const timestamp = Math.floor(
        date.getTime() / 1000
    );

    return days > 0
        ? `<t:${timestamp}:R> (**${days}d ${hours}h** left)`
        : `<t:${timestamp}:R>`;
}

function buildPremiumStatusEmbed(status) {
    const isPremium =
        status.plan === "PREMIUM";

    const embed = new EmbedBuilder()
        .setColor(
            isPremium
                ? 0xf59e0b
                : 0x8b5cf6
        )
        .setTitle(
            isPremium
                ? "👑 Premium"
                : "Free Plan"
        )
        .addFields(
            {
                name: "Plan",
                value: isPremium
                    ? "Premium — all gated features unlocked"
                    : "Free",
                inline: true,
            },
            {
                name: "Crowns",
                value: `**${status.crowns.balance}**`,
                inline: true,
            },
            {
                name: "Lifetime",
                value:
                    `${status.crowns.earned} earned / ` +
                    `${status.crowns.spent} spent`,
                inline: true,
            }
        );

    if (status.unlocks.length > 0) {
        embed.addFields({
            name: "Active Crown unlocks",
            value: status.unlocks
                .map(
                    (unlock) =>
                        `• **${unlock.label}** — ${formatExpiry(
                            unlock.expiresAt
                        )}`
                )
                .join("\n"),
        });
    } else if (!isPremium) {
        embed.addFields({
            name: "Active Crown unlocks",
            value:
                "None. Unlock **Premium Assets** or " +
                "**Image-to-Aesthetic** with Crowns in Studio.",
        });
    }

    const studioUrl =
        buildStudioLink(PREMIUM_PAGE_PATH);

    embed.setDescription(
        studioUrl
            ? `Manage your plan, Crowns and unlocks on the [Premium page](${studioUrl}).`
            : "Manage your plan, Crowns and unlocks in Aesthetic King Studio " +
                `(**${PREMIUM_PAGE_PATH}**).`
    );

    embed.setFooter({
        text: "Aesthetic King • Premium",
    });

    return embed;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("premium")
        .setDescription(
            "Shows your Premium plan, Crown balance and active unlocks."
        ),

    async execute(interaction) {
        await interaction.deferReply({
            ephemeral: true,
        });

        const status =
            await getPremiumStatus(
                interaction.user.id
            );

        await interaction.editReply({
            embeds: [
                buildPremiumStatusEmbed(
                    status
                ),
            ],
        });
    },
};
