const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require("discord.js");

const {
    listPatchNotes,
    countPatchNotes,
    markPatchNotesSeen,
} = require("../../services/database/patchNoteService");

const config = require("../../config/env");

/**
 * `/patch-notes` — the changelog, from Discord.
 *
 * The Studio bell already surfaces these, but the bell only reaches someone
 * who is signed in and looking. The bot is where the audience actually is,
 * which is why the unseen-release nudge in `interactionCreate.js` points here.
 *
 * Newest first, a few releases per page. Notes are stored as free-text
 * bodies of arbitrary length, so the page size is small and every body is
 * truncated: an embed field caps at 1024 characters and the whole embed caps
 * at 6000, and a single verbose release would otherwise turn the reply into
 * the generic interaction error.
 */

const NOTES_PER_PAGE = 3;
const MAX_FIELD_LENGTH = 1024;
const MAX_BODY_LENGTH = 600;

function truncate(text, limit) {
    const value = String(text ?? "");

    if (value.length <= limit) {
        return value;
    }

    return `${value.slice(0, limit - 1).trimEnd()}…`;
}

function formatAge(date) {
    const ms = Date.now() - new Date(date).getTime();

    if (!Number.isFinite(ms) || ms < 0) {
        return "";
    }

    const days = Math.floor(ms / 86_400_000);

    if (days === 0) {
        return "today";
    }

    if (days === 1) {
        return "yesterday";
    }

    if (days < 30) {
        return `${days} days ago`;
    }

    const months = Math.floor(days / 30);

    return months === 1
        ? "1 month ago"
        : `${months} months ago`;
}

function buildPatchNotesEmbed({
    notes,
    page,
    totalPages,
    markedSeen,
}) {
    const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📝 Aesthetic King patch notes");

    const description = notes
        .map((note) => {
            const age = formatAge(note.publishedAt);
            const heading = `**${note.version} — ${note.title}**`;

            const body = note.body
                ? truncate(note.body, MAX_BODY_LENGTH)
                : "_No details._";

            return [
                heading,
                body,
                age ? `*${age}*` : "",
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\n\n");

    embed.setDescription(truncate(description, MAX_FIELD_LENGTH));

    const studioUrl = config.studio.url;

    embed.setFooter({
        text:
            totalPages > 1
                ? `Page ${page} of ${totalPages} • Full changelog in the Studio`
                : "Full changelog in the Studio",
    });

    if (studioUrl) {
        embed.setURL(`${studioUrl}/dashboard`);
    }

    // Only page 1 records the dismissal, so flicking back through old
    // releases cannot silently mark a future note as read.
    if (markedSeen) {
        embed.addFields({
            name: "\u200b",
            value:
                "You're all caught up — we'll mention it here next time " +
                "something ships.",
        });
    }

    return embed;
}

function buildEmptyEmbed() {
    return new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("📝 Aesthetic King patch notes")
        .setDescription(
            "No patch notes have been published yet. " +
            "They'll appear here as the bot gets updated."
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("patch-notes")
        .setDescription(
            "Shows what's new in Aesthetic King, newest release first."
        )
        .addIntegerOption((option) =>
            option
                .setName("page")
                .setDescription("Which page of older releases to show.")
                .setMinValue(1)
        ),

    async execute(interaction) {
        const requested = interaction.options.getInteger("page");
        const page = requested && requested > 0 ? requested : 1;

        /*
         * Deferred because this reads two queries and the reply is public;
         * an ephemeral reply would defeat the point, which is that everyone
         * in the channel sees what changed.
         */
        await interaction.deferReply();

        let total;
        let notes;

        try {
            [total, notes] = await Promise.all([
                countPatchNotes(),
                listPatchNotes({
                    take: NOTES_PER_PAGE,
                    skip: (page - 1) * NOTES_PER_PAGE,
                }),
            ]);
        } catch {
            await interaction.editReply({
                content:
                    "I couldn't reach the changelog right now. " +
                    "Try again in a moment.",
            });
            return;
        }

        if (total === 0) {
            await interaction.editReply({
                embeds: [buildEmptyEmbed()],
            });
            return;
        }

        const totalPages = Math.ceil(total / NOTES_PER_PAGE);

        if (notes.length === 0) {
            await interaction.editReply({
                content:
                    `There's no page ${page} — I only have ${total} ` +
                    `release${total === 1 ? "" : "s"} recorded ` +
                    `(pages 1–${totalPages}).`,
            });
            return;
        }

        const isFirstPage = page === 1;
        let markedSeen = false;

        /*
         * Best-effort. Failing to record a dismissal must not turn a
         * readable changelog into an error, so the reply is sent either way.
         */
        if (isFirstPage) {
            try {
                await markPatchNotesSeen(interaction.user);
                markedSeen = true;
            } catch {
                markedSeen = false;
            }
        }

        await interaction.editReply({
            embeds: [
                buildPatchNotesEmbed({
                    notes,
                    page,
                    totalPages,
                    markedSeen,
                }),
            ],
        });
    },
};
