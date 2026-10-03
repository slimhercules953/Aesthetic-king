/*
 * Server Appearance (Studio -> Server Studio -> Appearance).
 *
 * Studio writes these columns; this service is the only bot-side reader.
 * Rather than threading five settings through every embed builder, the
 * builders finish as normal and then hand their payload to
 * applyGuildAppearance(), which rewrites the colour, footer, pack badge,
 * images and reroll buttons in one place.
 *
 * Everything fails open to the bot's built-in defaults: a guild with no
 * settings row, or a database hiccup, gets exactly the pre-Appearance
 * behaviour.
 */

const {
    prisma,
} = require("./prisma");

const DEFAULT_APPEARANCE = Object.freeze({
    embedColor: null,
    footerText: null,
    showPackBadge: true,
    showGeneratedImages: true,
    showRerollButtons: true,
});

const CACHE_TTL_MS = 15 * 1000;
const cache = new Map();

function toBoolean(value, fallback) {
    if (value === true || value === false) {
        return value;
    }

    return fallback;
}

function normaliseHex(value) {
    if (typeof value !== "string") {
        return null;
    }

    const hex = value.trim();

    return /^#[0-9a-fA-F]{6}$/.test(hex)
        ? hex
        : null;
}

function normalise(settings) {
    return {
        embedColor: normaliseHex(settings?.embedColor),
        footerText:
            typeof settings?.footerText === "string" &&
            settings.footerText.trim()
                ? settings.footerText.trim().slice(0, 120)
                : null,
        showPackBadge: toBoolean(
            settings?.showPackBadge,
            DEFAULT_APPEARANCE.showPackBadge
        ),
        showGeneratedImages: toBoolean(
            settings?.showGeneratedImages,
            DEFAULT_APPEARANCE.showGeneratedImages
        ),
        showRerollButtons: toBoolean(
            settings?.showRerollButtons,
            DEFAULT_APPEARANCE.showRerollButtons
        ),
    };
}

async function loadAppearance(discordGuildId) {
    const guild = await prisma.guild.findUnique({
        where: {
            discordId: discordGuildId,
        },

        select: {
            settings: {
                select: {
                    embedColor: true,
                    footerText: true,
                    showPackBadge: true,
                    showGeneratedImages: true,
                    showRerollButtons: true,
                },
            },
        },
    });

    return normalise(guild?.settings);
}

async function getGuildAppearance(discordGuildId) {
    if (!discordGuildId) {
        return { ...DEFAULT_APPEARANCE };
    }

    const cached = cache.get(discordGuildId);

    if (cached && cached.expires > Date.now()) {
        return cached.value;
    }

    try {
        const value = await loadAppearance(discordGuildId);

        cache.set(discordGuildId, {
            value,
            expires: Date.now() + CACHE_TTL_MS,
        });

        return value;
    } catch (error) {
        console.error(
            "[guildAppearance] Unable to load appearance:",
            error?.message
        );

        return { ...DEFAULT_APPEARANCE };
    }
}

function invalidateGuildAppearance(discordGuildId) {
    if (discordGuildId) {
        cache.delete(discordGuildId);
    } else {
        cache.clear();
    }
}

/*
 * Embeds are already built by the time we get them, so setColor/setFooter
 * simply overwrite whatever the builder chose.
 */
function restyleEmbed(embed, appearance) {
    if (!embed?.data || typeof embed.setColor !== "function") {
        return;
    }

    if (appearance.embedColor) {
        embed.setColor(
            parseInt(
                appearance.embedColor.slice(1),
                16
            )
        );
    }

    if (appearance.footerText) {
        const existing =
            embed.data?.footer?.text ?? "";

        const icon =
            embed.data?.footer?.iconURL;

        embed.setFooter(
            icon
                ? {
                    text: appearance.footerText,
                    iconURL: icon,
                }
                : {
                    text: appearance.footerText,
                }
        );

        /*
         * Every builder appends a "controls expire in 5 minutes" note to
         * the footer. Overwriting the footer would silently drop it, so put
         * it in the description instead - a control that stops working with
         * no explanation looks like a bug.
         */
        if (/expire/i.test(existing)) {
            embed.data.description =
                (embed.data.description ?? "") +
                "\n*-# Controls expire in 5 minutes.*";
        }
    }

    if (
        !appearance.showPackBadge &&
        embed.data?.fields?.length
    ) {
        embed.setFields(
            embed.data.fields.filter(
                (field) =>
                    !/^aesthetic pack$/i.test(
                        field.name ?? ""
                    )
            )
        );
    }
}

/*
 * EmbedBuilder.setImage(null) writes an explicit null rather than removing
 * the key, which the API rejects, so drop the keys outright.
 */
function stripImages(embed) {
    if (!embed?.data) {
        return;
    }

    delete embed.data.image;
    delete embed.data.thumbnail;
}

/*
 * ButtonBuilder serialises the id as `custom_id` (the API shape), but a
 * payload built by hand or replayed from an API response uses `customId`, so
 * accept either.
 */
function isRerollButton(button) {
    const customId =
        button?.data?.custom_id ??
        button?.data?.customId ??
        "";

    return /:reroll(?::|$)/.test(String(customId));
}

/**
 * Applies a guild's appearance to a finished message payload.
 *
 * Safe on any shape: strings, { embeds, components, files }, or nothing.
 * Returns the payload that should actually be sent.
 */
async function applyGuildAppearance(
    discordGuildId,
    payload
) {
    const appearance =
        await getGuildAppearance(discordGuildId);

    const changed =
        appearance.embedColor ||
        appearance.footerText ||
        !appearance.showPackBadge ||
        !appearance.showGeneratedImages ||
        !appearance.showRerollButtons;

    if (
        !changed ||
        !payload ||
        !payload.embeds?.length
    ) {
        return payload;
    }

    const result = { ...payload };

    result.embeds = payload.embeds.map((embed) => {
        restyleEmbed(embed, appearance);

        if (!appearance.showGeneratedImages) {
            stripImages(embed);
        }

        return embed;
    });

    /*
     * Only drop attachments the embeds no longer reference. Palette and
     * profile results are image-only responses, so removing the file
     * without clearing the embed image would make Discord reject the
     * whole message.
     */
    if (
        !appearance.showGeneratedImages &&
        Array.isArray(payload.files)
    ) {
        const referenced = new Set(
            result.embeds.flatMap((embed) =>
                [
                    embed.data?.image?.url,
                    embed.data?.thumbnail?.url,
                ]
                    .filter(Boolean)
            )
        );

        result.files = payload.files.filter(
            (file) => {
                const name =
                    typeof file === "string"
                        ? file
                        : file?.name ??
                          file?.attachment ??
                          "";

                return (
                    name &&
                    referenced.has(
                        `attachment://${name}`
                    )
                );
            }
        );
    }

    if (
        !appearance.showRerollButtons &&
        Array.isArray(payload.components)
    ) {
        result.components = payload.components
            .map((row) => {
                const components =
                    row?.components ?? [];

                const remaining =
                    components.filter(
                        (button) =>
                            !isRerollButton(button)
                    );

                return remaining.length ===
                    components.length
                    ? row
                    : row.setComponents(remaining);
            })
            .filter(
                (row) =>
                    (row?.components ?? []).length >
                    0
            );
    }

    return result;
}

const APPEARANCE_PATCHED = Symbol("appearancePatched");

const APPEARANCE_AWARE_METHODS = [
    "reply",
    "editReply",
    "update",
    "followUp",
];

/**
 * Wraps an interaction's outgoing-message methods so every response is
 * styled, regardless of which command or button produced it.
 *
 * Patching the four entry points beats editing a dozen embed builders:
 * a new command gets appearance support for free, and there is only one
 * place where the settings are read.
 */
function applyAppearanceToInteraction(interaction) {
    if (!interaction.guildId || interaction[APPEARANCE_PATCHED]) {
        return;
    }

    Object.defineProperty(
        interaction,
        APPEARANCE_PATCHED,
        {
            value: true,
            enumerable: false,
        }
    );

    for (const method of APPEARANCE_AWARE_METHODS) {
        const original = interaction[method];

        if (typeof original !== "function") {
            continue;
        }

        interaction[method] = async function (
            payload,
            ...rest
        ) {
            let next = payload;

            if (payload && typeof payload === "object") {
                try {
                    next = await applyGuildAppearance(
                        interaction.guildId,
                        payload
                    );
                } catch (error) {
                    console.error(
                        `[guildAppearance] Failed to style ${method}:`,
                        error?.message
                    );
                }
            }

            return original.call(this, next, ...rest);
        };
    }
}

module.exports = {
    DEFAULT_APPEARANCE,
    getGuildAppearance,
    invalidateGuildAppearance,
    applyGuildAppearance,
    applyAppearanceToInteraction,
};
