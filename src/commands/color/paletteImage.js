const {
    SlashCommandBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");

const {
    extractColors,
    detectMimeTypeFromBuffer,
    SUPPORTED_MIME_TYPES,
} = require("../../services/colors/colorService");

const {
    renderPalette,
} = require("../../services/rendering/paletteRenderer");

const {
    auditPalette,
    formatRatio,
} = require("../../services/colors/contrastService");

const {
    buildSystemEmbed,
} = require("../../components/embeds/systemResponse");

const {
    downloadAttachment,
} = require("../../utils/attachmentDownloader");

const logger = require("../../utils/logger");

const MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_COUNT = 5;

// Prototype: kept as its own command so the live /palette is untouched.
// If it sticks, fold this in as `/palette from-image` and delete this file.
module.exports = {
    requireGenerationChannel: true,

    data: new SlashCommandBuilder()
        .setName("palette-image")
        .setDescription(
            "Prototype: pull a colour palette out of an image you upload."
        )
        .addAttachmentOption((option) =>
            option
                .setName("image")
                .setDescription("JPEG, PNG or WebP to sample colours from.")
                .setRequired(true)
        )
        .addIntegerOption((option) =>
            option
                .setName("colors")
                .setDescription("How many colours to pull (2-8).")
                .setMinValue(2)
                .setMaxValue(8)
                .setRequired(false)
        ),

    async execute(interaction) {
        const attachment =
            interaction.options.getAttachment("image");

        const count =
            interaction.options.getInteger("colors") ??
            DEFAULT_COUNT;

        if (!attachment) {
            await interaction.reply({
                embeds: [
                    buildSystemEmbed({
                        title: "No Image",
                        description:
                            "Attach a JPEG, PNG or WebP image and try again.",
                        type: "error",
                    }),
                ],
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        if (attachment.size > MAX_BYTES) {
            await interaction.reply({
                embeds: [
                    buildSystemEmbed({
                        title: "Image Too Large",
                        description:
                            `That file is ${(attachment.size / 1024 / 1024).toFixed(1)} MB. ` +
                            "Keep it under 8 MB.",
                        type: "error",
                    }),
                ],
                flags: MessageFlags.Ephemeral,
            });

            return;
        }

        await interaction.deferReply();

        let buffer;

        try {
            buffer = await downloadAttachment(attachment, {
                maxBytes: MAX_BYTES,
            });
        } catch (error) {
            await interaction.editReply({
                embeds: [
                    buildSystemEmbed({
                        title: "Download Failed",
                        description:
                            error?.message ??
                            "I couldn't download that attachment. Re-upload it and try again.",
                        type: "error",
                    }),
                ],
            });

            return;
        }

        if (!buffer) {
            await interaction.editReply({
                embeds: [
                    buildSystemEmbed({
                        title: "Image Too Large",
                        description:
                            "That file is bigger than the 8 MB limit once Discord finished sending it.",
                        type: "error",
                    }),
                ],
            });

            return;
        }

        const detected = detectMimeTypeFromBuffer(buffer);

        if (!detected || !SUPPORTED_MIME_TYPES.has(detected)) {
            await interaction.editReply({
                embeds: [
                    buildSystemEmbed({
                        title: "Unsupported Image",
                        description:
                            `I can only sample JPEG, PNG and WebP. ` +
                            `That file came through as \`${detected ?? "unknown"}\`.` +
                            "\n\nGIFs and screenshots of animated content usually work if you convert them to PNG first.",
                        type: "warning",
                    }),
                ],
            });

            return;
        }

        let colors;

        try {
            colors = await extractColors(buffer, detected, count);
        } catch (error) {
            logger.warn(
                `palette-image extraction failed: ${error?.message}`
            );

            await interaction.editReply({
                embeds: [
                    buildSystemEmbed({
                        title: "Nothing To Sample",
                        description:
                            error?.message ??
                            "No colours could be extracted from that image.",
                        type: "error",
                    }),
                ],
            });

            return;
        }

        if (!colors || colors.length === 0) {
            await interaction.editReply({
                embeds: [
                    buildSystemEmbed({
                        title: "Nothing To Sample",
                        description:
                            "That image had no usable colours in it.",
                        type: "error",
                    }),
                ],
            });

            return;
        }

        const picked = colors.slice(0, count);
        const hexes = picked.map((color) => color.hex.toLowerCase());

        const image = await renderPalette({ colors: hexes });

        const attachmentOut = new AttachmentBuilder(image, {
            name: "sampled-palette.png",
        });

        const audit = auditPalette(hexes);

        const lines = picked.map((color, index) => {
            const result = audit.colors[index];
            const weight = color.population
                ? ` \`${Math.round(color.population * 100)}%\``
                : "";

            return (
                `**${index + 1}.** \`${result.hex.toUpperCase()}\`${weight} — ` +
                `${result.onDark.emoji} dark ${formatRatio(result.onDark.ratio)} • ` +
                `${result.onLight.emoji} light ${formatRatio(result.onLight.ratio)}`
            );
        });

        const embed = new EmbedBuilder()
            .setTitle("✦ Sampled From Your Image")
            .setDescription(lines.join("\n") || "No colours found.")
            .setColor(parseInt(hexes[0].replace("#", ""), 16))
            .addFields(
                {
                    name: "Source",
                    value:
                        attachment.name
                            ? `${attachment.name} • ${detected}`
                            : detected,
                    inline: true,
                },
                {
                    name: "Theme fit",
                    value: audit.verdict,
                    inline: false,
                }
            )
            .setImage("attachment://sampled-palette.png")
            .setFooter({
                text:
                    "Aesthetic King • Prototype • % = share of the image",
            });

        await interaction.editReply({
            embeds: [embed],
            files: [attachmentOut],
        });
    },
};
