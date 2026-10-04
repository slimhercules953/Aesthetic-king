const {
    SlashCommandBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");

const {
    getAesthetic,
    getAestheticChoices,
} = require("../../data/aesthetics");

const {
    parseHexList,
    normalizeHex,
    auditPalette,
    formatRatio,
    DISCORD_THEMES,
} = require("../../services/colors/contrastService");

const {
    renderLegibilityPreview,
} = require("../../services/rendering/legibilityRenderer");

const {
    buildSystemEmbed,
} = require("../../components/embeds/systemResponse");

const MAX_COLORS = 8;

function describeColor(color) {
    return (
        `\`${color.hex.toUpperCase()}\` ${color.onDark.emoji} ` +
        `**${formatRatio(color.onDark.ratio)}** dark / ` +
        `**${formatRatio(color.onLight.ratio)}** light ${color.onLight.emoji}`
    );
}

function hexList(colors, limit = 6) {
    const shown = colors.slice(0, limit).map((c) => `\`${c.hex.toUpperCase()}\``);

    if (colors.length > limit) {
        shown.push(`+${colors.length - limit} more`);
    }

    return shown.join(", ");
}

function buildFindings(audit) {
    const findings = [];

    const { colors } = audit;

    const darkOnly = colors.filter(
        (c) => c.onDark.ratio >= 4.5 && c.onLight.ratio < 4.5
    );
    const lightOnly = colors.filter(
        (c) => c.onLight.ratio >= 4.5 && c.onDark.ratio < 4.5
    );

    const claimed = new Set([...darkOnly, ...lightOnly].map((c) => c.hex));

    const dead = colors.filter(
        (c) => c.onDark.ratio < 3 && c.onLight.ratio < 3
    );
    const largeOnly = colors.filter(
        (c) =>
            c.largeTextEverywhere &&
            !claimed.has(c.hex) &&
            !(c.onDark.ratio >= 4.5 && c.onLight.ratio >= 4.5)
    );

    if (dead.length) {
        findings.push(
            `🔴 **Unreadable as text on both themes:** ${hexList(dead)}. Keep these for backgrounds and accents, not usernames or roles.`
        );
    }

    if (largeOnly.length) {
        findings.push(
            `🟠 **Large text only:** ${hexList(largeOnly)}. Fine for a bold username, too weak for bio or message copy.`
        );
    }

    if (darkOnly.length) {
        findings.push(
            `🌙 **Dark mode only:** ${hexList(darkOnly)} ${darkOnly.length === 1 ? "clears" : "clear"} AA on dark but ${darkOnly.length === 1 ? "goes" : "go"} unreadable on light.`
        );
    }

    if (lightOnly.length) {
        findings.push(
            `☀️ **Light mode only:** ${hexList(lightOnly)} ${lightOnly.length === 1 ? "clears" : "clear"} AA on light but ${lightOnly.length === 1 ? "washes" : "wash"} out on dark. Pale pastels usually land here.`
        );
    }

    if (audit.duplicates.length) {
        const pairs = audit.duplicates
            .slice(0, 3)
            .map(
                (d) =>
                    `\`${d.a.toUpperCase()}\` / \`${d.b.toUpperCase()}\` (ΔE ${d.distance.toFixed(0)})`
            )
            .join(", ");

        findings.push(
            `🟣 **Too similar to tell apart:** ${pairs}. Separate them by lightness, not just hue.`
        );
    }

    if (!findings.length) {
        findings.push("✅ Nothing to flag — every color holds up on both themes.");
    }

    return findings.join("\n\n");
}

module.exports = {
    requireGenerationChannel: true,

    data: new SlashCommandBuilder()
        .setName("legibility")
        .setDescription(
            "Prototype: check whether your colors are actually readable in Discord light and dark mode."
        )
        .addStringOption((option) =>
            option
                .setName("colors")
                .setDescription("Hex colors to audit, e.g. #ff0044 2b2d31 #0a0a0a")
                .setRequired(false)
                .setMaxLength(120)
        )
        .addStringOption((option) =>
            option
                .setName("style")
                .setDescription("Audit the colors of a built-in aesthetic.")
                .setRequired(false)
                .addChoices(...getAestheticChoices())
        )
        .addStringOption((option) =>
            option
                .setName("username")
                .setDescription("Name to preview. Defaults to your display name.")
                .setRequired(false)
                .setMaxLength(32)
        ),

    async execute(interaction) {
        const colorsOption = interaction.options.getString("colors");
        const styleId = interaction.options.getString("style");
        const username =
            interaction.options.getString("username") ??
            interaction.user.displayName ??
            interaction.user.username;

        let colors = [];
        let source = "your colors";

        if (styleId) {
            const aesthetic = getAesthetic(styleId);

            if (!aesthetic) {
                await interaction.reply({
                    embeds: [
                        buildSystemEmbed({
                            title: "Unknown Style",
                            description:
                                `I don't have an aesthetic called \`${styleId}\`.`,
                            type: "error",
                        }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });

                return;
            }

            colors = aesthetic.colors ?? [];
            source = `${aesthetic.name} palette`;
        }

        if (colorsOption) {
            const parsed = parseHexList(colorsOption);

            if (!parsed.length) {
                await interaction.reply({
                    embeds: [
                        buildSystemEmbed({
                            title: "No Colors Found",
                            description:
                                "I couldn't read any hex colors out of that. Try something like `#ff0044 2b2d31 0a0a0a`.",
                            type: "error",
                        }),
                    ],
                    flags: MessageFlags.Ephemeral,
                });

                return;
            }

            colors = parsed;
            source = "your colors";
        }

        colors = colors
            .map((color) => normalizeHex(color))
            .filter(Boolean)
            .slice(0, MAX_COLORS);

        if (!colors.length) {
            await interaction.reply({
                embeds: [
                    buildSystemEmbed({
                        title: "Nothing To Audit",
                        description:
                            "Give me some `colors` or pick a `style` to audit.",
                        type: "info",
                    }),
                ],
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferReply();

        const audit = auditPalette(colors);

        // Preview the color that is most likely to be used as a name color:
        // the most saturated one, falling back to the first.
        const hero =
            [...audit.colors].sort(
                (a, b) =>
                    Math.max(...Object.values(b.rgb)) -
                    Math.min(...Object.values(b.rgb)) -
                    (Math.max(...Object.values(a.rgb)) -
                        Math.min(...Object.values(a.rgb)))
            )[0] ?? audit.colors[0];

        const swatches = audit.colors.map((color) => ({
            ...color,
            badge: color.worksEverywhere
                ? "BOTH"
                : color.onDark.ratio >= 4.5
                    ? "DARK"
                    : color.onLight.ratio >= 4.5
                        ? "LIGHT"
                        : "NEITHER",
        }));

        const image = await renderLegibilityPreview({
            username,
            color: hero.hex,
            colors: swatches,
        });

        const attachment = new AttachmentBuilder(image, {
            name: "legibility-preview.png",
        });

        const lines = audit.colors.map(
            (color, index) => `**${index + 1}.** ${describeColor(color)}`
        );

        const embed = new EmbedBuilder()
            .setTitle(`✦ Legibility Audit — ${source}`)
            .setDescription(
                `**${audit.verdict}**\n\n${lines.join("\n")}`
            )
            .setColor(parseInt(hero.hex.replace("#", ""), 16))
            .addFields(
                {
                    name: "Findings",
                    value: buildFindings(audit).slice(0, 1024),
                },
                {
                    name: "Reference",
                    value:
                        `Dark background \`${DISCORD_THEMES.dark.background.toUpperCase()}\` • ` +
                        `Light background \`${DISCORD_THEMES.light.background.toUpperCase()}\`\n` +
                        "AA needs 4.5:1 for body text, 3:1 for large text. AAA is 7:1.",
                    inline: false,
                }
            )
            .setImage("attachment://legibility-preview.png")
            .setFooter({
                text: "Aesthetic King • Prototype • WCAG 2.1 contrast",
            });

        await interaction.editReply({
            embeds: [embed],
            files: [attachment],
        });
    },
};
