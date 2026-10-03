/*
 * Aesthetic Packs are configured per server in Studio, but every command
 * used to resolve them differently: `/aesthetic` had the full explicit-pack
 * plus default-pack cascade, and everything else ignored packs entirely.
 * A server owner could set a default Pack and see six commands carry on
 * generating unrelated content.
 *
 * Everything in here exists so each command performs the identical
 * resolution: an explicitly chosen Pack wins, then the server default, and
 * a Pack that was named but no longer resolves is reported rather than
 * silently dropped.
 */

const {
    getEnabledGuildPacks,
    getEnabledGuildPackById,
    getDefaultGuildPack,
} = require("../database/guildAestheticPackService");

const {
    getDefaultAestheticId,
    getDefaultMoodId,
} = require("../database/guildSettingsService");

const {
    buildSystemEmbed,
} = require("../../components/embeds/systemResponse");

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const MAX_PACK_SYMBOLS = 8;

function normalizePackColors(packColors) {
    if (!Array.isArray(packColors)) {
        return [];
    }

    return [
        ...new Set(
            packColors
                .filter(
                    (color) =>
                        typeof color === "string" &&
                        HEX_COLOR.test(color.trim())
                )
                .map((color) =>
                    color.trim().toUpperCase()
                )
        ),
    ];
}

function normalizePackSymbols(packSymbols) {
    if (!Array.isArray(packSymbols)) {
        return [];
    }

    return [
        ...new Set(
            packSymbols
                .filter(
                    (symbol) =>
                        typeof symbol === "string" &&
                        symbol.trim()
                )
                .map((symbol) => symbol.trim())
        ),
    ].slice(0, MAX_PACK_SYMBOLS);
}

/*
 * Returns the Pack a command should honour, plus whether the caller asked
 * for one that could not be used. `unavailable` is only true when the user
 * explicitly named a Pack, because falling back quietly from a typed choice
 * is how a server ends up with "it ignored my Pack" confusion.
 */
async function resolvePackContext(
    discordGuildId,
    explicitPackId = null
) {
    if (!discordGuildId) {
        return {
            pack: null,
            unavailable: false,
        };
    }

    if (explicitPackId) {
        const pack = await getEnabledGuildPackById(
            discordGuildId,
            explicitPackId
        );

        return {
            pack,
            unavailable: !pack,
        };
    }

    const pack = await getDefaultGuildPack(
        discordGuildId
    );

    return {
        pack,
        unavailable: false,
    };
}

/*
 * The filters a Pack carries are defaults, never overrides: whatever the
 * person typed on the command line still wins.
 */
function pickPackValue(explicitValue, packValue) {
    return explicitValue || packValue || null;
}

/*
 * Every generation command resolves its filters in the same order:
 *
 *   explicit command option -> Aesthetic Pack -> server defaults
 *
 * Skipping that ladder is what made a configured default Pack apply to
 * `/aesthetic` only. `missingAesthetic` is reported instead of guessed so
 * each command can word its own reply.
 */
async function resolveGenerationContext({
    interaction,
    aestheticId = null,
    moodId = null,
}) {
    const { pack, unavailable } =
        await resolvePackContext(
            interaction.guildId,
            interaction.options?.getString("pack") ?? null
        );

    let resolvedAestheticId = aestheticId;

    if (!resolvedAestheticId) {
        resolvedAestheticId = pack?.aestheticId || null;
    }

    if (
        !resolvedAestheticId &&
        interaction.guildId
    ) {
        resolvedAestheticId =
            await getDefaultAestheticId(
                interaction.guildId
            );
    }

    let resolvedMoodId = moodId;

    if (!resolvedMoodId) {
        resolvedMoodId = pack?.moodId || null;
    }

    if (!resolvedMoodId && interaction.guildId) {
        resolvedMoodId = await getDefaultMoodId(
            interaction.guildId
        );
    }

    return {
        pack,
        packUnavailable: unavailable,

        aestheticId: resolvedAestheticId,
        moodId: resolvedMoodId,
        missingAesthetic: !resolvedAestheticId,

        packColors: getPackColors(pack),
        packSymbols: getPackSymbols(pack),
    };
}

function getPackColors(pack) {
    return normalizePackColors(pack?.colors);
}

function getPackSymbols(pack) {
    return normalizePackSymbols(pack?.symbols);
}

/*
 * Slash command autocomplete for the shared `pack` option. Discord caps
 * choices at 25, so the focused text filters before the slice.
 */
async function respondToPackAutocomplete(interaction) {
    if (!interaction.guildId) {
        await interaction.respond([]);
        return;
    }

    const focused = interaction.options
        .getFocused()
        .toLowerCase()
        .trim();

    const packs = await getEnabledGuildPacks(
        interaction.guildId
    );

    const choices = packs
        .filter(
            (pack) =>
                !focused ||
                pack.name.toLowerCase().includes(focused)
        )
        .slice(0, 25)
        .map((pack) => ({
            name: pack.name,
            value: pack.id,
        }));

    await interaction.respond(choices);
}

/*
 * The `pack` option is identical on every generation command, so the
 * definition lives here rather than being retyped seven times.
 */
function withPackOption(option) {
    return option
        .setName("pack")
        .setDescription(
            "Use an Aesthetic Pack from this server."
        )
        .setRequired(false)
        .setAutocomplete(true);
}

/*
 * A named Pack that no longer resolves is worth an explicit reply: silently
 * generating from the server default looks identical to ignoring the Pack.
 */
function buildPackUnavailableReply() {
    return {
        embeds: [
            buildSystemEmbed({
                title:
                    "Aesthetic Pack Unavailable",

                description:
                    "That Aesthetic Pack is unavailable, disabled, or no longer exists.",

                type: "warning",
            }),
        ],

        components: [],
        files: [],
    };
}

/*
 * Likewise, a command with no style option needs somewhere to land when
 * neither a Pack nor the server supplies an aesthetic.
 */
function buildAestheticRequiredReply(description) {
    return {
        embeds: [
            buildSystemEmbed({
                title: "Aesthetic Required",
                description,
                type: "info",
            }),
        ],

        components: [],
        files: [],
    };
}

module.exports = {
    resolvePackContext,
    resolveGenerationContext,
    pickPackValue,
    normalizePackColors,
    normalizePackSymbols,
    getPackColors,
    getPackSymbols,
    buildPackUnavailableReply,
    buildAestheticRequiredReply,
    respondToPackAutocomplete,
    withPackOption,
    MAX_PACK_SYMBOLS,
};
