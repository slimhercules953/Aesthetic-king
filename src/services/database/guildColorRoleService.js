const {
    prisma,
} = require("./prisma");

/*
 * Backing logic for `/color`, where a member picks their own name colour.
 *
 * The whole module is built around one rule: the bot must only ever hand out
 * roles that it created itself. A tool that can assign an arbitrary role is a
 * privilege-escalation tool — "give me a colour" and "give me Administrator"
 * are the same API call unless something draws the line. That line is the
 * `GuildCosmeticRole` table: if there is no receipt, the bot did not make it,
 * and the bot does not touch it.
 *
 * The second rule is that a colour role must stay cosmetic. Discord has no
 * "read-only role" concept, so a role that already exists and already carries
 * a permission could be renamed into looking like a paint job. Roles created
 * here are created with no permissions, unhoisted and unmentionable, and the
 * receipt is what proves that provenance later.
 */

const COLOR_ROLE_MODES = Object.freeze({
    FREE: "FREE",
    PALETTE: "PALETTE",
});

const COLOR_ROLE_SOURCES = Object.freeze({
    STUDIO: "STUDIO",
    COMMAND: "COMMAND",
});

/** Discord's own limit on a role name. */
const MAX_ROLE_NAME_LENGTH = 100;

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * Roles a member may not be given, whatever the receipt table says.
 *
 * Belt to the receipt's braces. `@everyone` is not a real role row and would
 * apply to the entire server; managed roles belong to an integration or a bot,
 * so taking one off a member could break something the owner wired up on
 * purpose.
 */
const NEVER_ASSIGNABLE_NAMES = new Set([
    "everyone",
    "here",
]);

function normalizeHex(value) {
    if (typeof value !== "string") {
        return null;
    }

    let candidate = value.trim();

    if (!candidate) {
        return null;
    }

    /*
     * Members type the `#` roughly half the time. Accepting both is the whole
     * difference between "that didn't work" and a colour, and nothing
     * downstream can confuse `FF8800` for anything else once the `#` is added.
     */
    if (candidate !== "#" && !candidate.startsWith("#")) {
        candidate = `#${candidate}`;
    }

    if (!HEX_PATTERN.test(candidate)) {
        return null;
    }

    return candidate.toUpperCase();
}

/**
 * `#C084FC` → `12617468`, the integer Discord stores.
 *
 * `#000000` maps to `0`, which Discord reserves for "no role colour" and
 * renders as the default grey. A member who asks for pure black and gets a
 * grey name has been lied to, so it is refused with an explanation instead.
 */
function colorToInt(hex) {
    const normalized = normalizeHex(hex);

    if (!normalized || normalized === "#000000") {
        return null;
    }

    return parseInt(normalized.slice(1), 16);
}

function colorFromInt(value) {
    const clamped =
        Number.isFinite(value) && value > 0 && value <= 0xffffff
            ? Math.trunc(value)
            : 0;

    return `#${clamped
        .toString(16)
        .padStart(6, "0")
        .toUpperCase()}`;
}

/**
 * A role name safe to send to Discord.
 *
 * Returns `null` rather than throwing: this runs on whatever a member typed,
 * and the caller's job is to produce a helpful reply, not to unwind an
 * exception.
 */
function normalizeRoleName(value) {
    if (typeof value !== "string") {
        return null;
    }

    /*
     * Discord rejects control characters outright. `\p{Cc}` is the Unicode
     * control-character class, which covers the C0 and C1 ranges — slightly
     * wider than the C0 range Discord complains about, and no worse to strip.
     */
    const name = value
        .replace(/\p{Cc}/gu, "")
        .trim();

    if (!name || name.length > MAX_ROLE_NAME_LENGTH) {
        return null;
    }

    /*
     * Discord will not name a role @everyone or @here, and both ping in some
     * clients regardless of the role's own permissions.
     */
    const lowered = name.toLowerCase().replace(/^@/, "");

    if (NEVER_ASSIGNABLE_NAMES.has(lowered)) {
        return null;
    }

    return name;
}

/**
 * The name `/color` gives a colour role when the member does not supply one.
 *
 * Keyed on the hex rather than the member so that everyone who picks
 * `#C084FC` shares one `#C084FC` role. That matters more than it looks:
 * a role per member would exhaust Discord's 250-role cap within a busy
 * afternoon, and shared roles are what make the member list read as a colour
 * palette rather than a list of people.
 */
function defaultRoleNameForColor(hex) {
    return normalizeHex(hex) ?? null;
}

function normalizeMode(value) {
    const upper =
        typeof value === "string"
            ? value.trim().toUpperCase()
            : "";

    return Object.prototype.hasOwnProperty.call(
        COLOR_ROLE_MODES,
        upper
    )
        ? upper
        : null;
}

async function getGuildId(discordGuildId) {
    if (!discordGuildId) {
        return null;
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId: discordGuildId,
            },

            select: {
                id: true,
            },
        });

    return guild?.id ?? null;
}

/**
 * Whether `/color` is live here, and in which mode.
 *
 * Absent settings mean off. A server that has never opened the dashboard gets
 * the same answer as one whose owner explicitly declined, which is the safe
 * reading of a bot that can create roles.
 */
async function getColorRoleSettings(
    discordGuildId
) {
    if (!discordGuildId) {
        return {
            enabled: false,
            mode: COLOR_ROLE_MODES.FREE,
            configured: false,
        };
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId: discordGuildId,
            },

            select: {
                settings: {
                    select: {
                        colorRolesEnabled: true,
                        colorRoleMode: true,
                    },
                },
            },
        });

    const settings = guild?.settings;

    return {
        enabled: settings?.colorRolesEnabled === true,
        mode:
            normalizeMode(settings?.colorRoleMode) ??
            COLOR_ROLE_MODES.FREE,
        configured: Boolean(settings),
    };
}

/**
 * Turns `/color` on or off and records the mode.
 *
 * Only ever called from a path that has already proved the caller holds
 * Manage Server; this function does not re-check Discord permissions because
 * the pipeline and the command both do that first, and a service that guessed
 * would eventually disagree with them.
 */
async function updateColorRoleSettings(
    discordGuildId,
    patch
) {
    const guildId =
        await getGuildId(discordGuildId);

    if (!guildId) {
        return null;
    }

    const data = {};

    if (
        Object.prototype.hasOwnProperty.call(
            patch ?? {},
            "enabled"
        )
    ) {
        data.colorRolesEnabled = Boolean(patch.enabled);
    }

    if (
        Object.prototype.hasOwnProperty.call(
            patch ?? {},
            "mode"
        )
    ) {
        const mode = normalizeMode(patch.mode);

        if (!mode) {
            throw new Error(
                "Unknown colour role mode."
            );
        }

        data.colorRoleMode = mode;
    }

    if (Object.keys(data).length === 0) {
        return getColorRoleSettings(discordGuildId);
    }

    await prisma.guildSettings.upsert({
        where: {
            guildId,
        },

        update: data,

        create: {
            guildId,
            colorRolesEnabled:
                data.colorRolesEnabled ?? false,
            colorRoleMode:
                data.colorRoleMode ??
                COLOR_ROLE_MODES.FREE,
        },
    });

    return getColorRoleSettings(discordGuildId);
}

/* ------------------------------------------------------------------ *
 * The palette
 * ------------------------------------------------------------------ */

/**
 * Roles an owner has marked self-assignable, newest first.
 *
 * Reads the receipt table only, so a role deleted in Discord disappears from
 * the palette as soon as its row is forgotten. The command filters out rows
 * whose role has since vanished; a stale option is worse than no option.
 */
async function listPaletteColors(
    discordGuildId
) {
    if (!discordGuildId) {
        return [];
    }

    const guild =
        await prisma.guild.findUnique({
            where: {
                discordId: discordGuildId,
            },

            select: {
                cosmeticRoles: {
                    where: {
                        selfAssignable: true,
                    },

                    orderBy: {
                        createdAt: "desc",
                    },

                    take: 25,
                },
            },
        });

    return guild?.cosmeticRoles ?? [];
}

/**
 * Adds a colour to the palette.
 *
 * The role is created first and recorded second, so a Discord failure leaves
 * nothing behind. The reverse order would leave a receipt pointing at a role
 * that does not exist, which the command would then offer and fail on.
 */
async function recordColorRole(
    discordGuildId,
    role,
    options = {}
) {
    const guildId =
        await getGuildId(discordGuildId);

    if (!guildId) {
        return null;
    }

    const color = normalizeHex(role?.color);

    if (!color || !role?.id) {
        return null;
    }

    const name =
        normalizeRoleName(role.name) ?? color;

    return prisma.guildCosmeticRole.upsert({
        where: {
            guildId_discordRoleId: {
                guildId,
                discordRoleId: String(role.id),
            },
        },

        update: {
            name,
            color,
            selfAssignable:
                options.selfAssignable ?? undefined,
        },

        create: {
            guildId,
            discordRoleId: String(role.id),
            name,
            color,
            createdBy: options.createdBy ?? null,
            source:
                options.source ??
                COLOR_ROLE_SOURCES.COMMAND,
            selfAssignable:
                options.selfAssignable === true,
        },
    });
}

/**
 * Whether a role is one the bot made and will therefore touch.
 *
 * This is the security boundary of the whole feature. Everything that could
 * change a member's roles passes through here first.
 */
async function isBotCreatedRole(
    discordGuildId,
    discordRoleId
) {
    if (!discordGuildId || !discordRoleId) {
        return false;
    }

    const row =
        await prisma.guildCosmeticRole.findFirst({
            where: {
                guild: {
                    discordId: discordGuildId,
                },

                discordRoleId: String(discordRoleId),
            },

            select: {
                id: true,
            },
        });

    return Boolean(row);
}

/**
 * Forgets a receipt so the bot stops considering the role its own.
 *
 * Never deletes the Discord role. An owner who wants that gone deletes it in
 * Discord and then clears the row here.
 */
async function forgetColorRole(
    discordGuildId,
    discordRoleId
) {
    if (!discordGuildId || !discordRoleId) {
        return false;
    }

    const result =
        await prisma.guildCosmeticRole.deleteMany({
            where: {
                guild: {
                    discordId: discordGuildId,
                },

                discordRoleId: String(discordRoleId),
            },
        });

    return result.count > 0;
}

/**
 * Clears self-assignability without forgetting the role.
 *
 * Used when an owner removes a colour from the palette but the member who
 * already has it should keep it until they change it themselves.
 */
async function setPaletteColor(
    discordGuildId,
    discordRoleId,
    selfAssignable
) {
    if (!discordGuildId || !discordRoleId) {
        return false;
    }

    const existing =
        await prisma.guildCosmeticRole.findFirst({
            where: {
                guild: {
                    discordId: discordGuildId,
                },

                discordRoleId: String(discordRoleId),
            },

            select: {
                id: true,
            },
        });

    if (!existing) {
        return false;
    }

    await prisma.guildCosmeticRole.update({
        where: {
            id: existing.id,
        },

        data: {
            selfAssignable: Boolean(selfAssignable),
        },
    });

    return true;
}

/* ------------------------------------------------------------------ *
 * Choosing a colour
 * ------------------------------------------------------------------ */

/**
 * Finds the role for a hex, creating it if it does not exist yet.
 *
 * Returns `{ ok: false, error }` with a message written for the member
 * rather than for a log. Validation happens before anything is asked of
 * Discord, because a 400 from Discord comes back as an opaque English
 * sentence whereas our own message can say what to type.
 */
async function resolveColorRole(
    discordGuildId,
    hex,
    options = {}
) {
    const color = normalizeHex(hex);

    if (!color) {
        return {
            ok: false,
            error:
                "That is not a color I understand. Use six digits like **#C084FC**.",
        };
    }

    if (colorToInt(color) === null) {
        return {
            ok: false,
            error:
                "Pure black shows up as Discord's default grey, so it is not available. Try **#010101** instead.",
        };
    }

    /*
     * A caller that already knows which role it wants — a curated palette
     * entry, for instance — gets that exact row rather than merely a row with
     * the same colour. Two roles can share a hex, and the caller's choice is
     * the one with the owner's approval behind it.
     */
    const existing =
        options.preferredRoleId
            ? await prisma.guildCosmeticRole.findFirst({
                where: {
                    guild: {
                        discordId: discordGuildId,
                    },

                    discordRoleId:
                        String(options.preferredRoleId),

                    color,
                },
            })
            : await prisma.guildCosmeticRole.findFirst({
                where: {
                    guild: {
                        discordId: discordGuildId,
                    },

                    color,
                },

                orderBy: {
                    createdAt: "asc",
                },
            });

    if (existing) {
        return { ok: true, role: existing, created: false };
    }

    const name =
        normalizeRoleName(options.name) ??
        defaultRoleNameForColor(color);

    if (!name) {
        return {
            ok: false,
            error:
                "That role name will not work here. Keep it under 100 characters and do not call it everyone.",
        };
    }

    return {
        ok: true,
        needsCreation: true,
        color,
        name,
    };
}

/**
 * Whether a role is safe to hold on to right now.
 *
 * Re-checked at assignment time, not just at creation, because the world
 * changes underneath us: an owner can grant a role permissions in Discord
 * after the bot made it, and a role can be managed by an integration the bot
 * knows nothing about. Assigning either would turn a colour picker into
 * something else, so the answer is no and the member is told to ask an admin.
 */
function isRoleSafeToAssign(role) {
    if (!role) {
        return false;
    }

    if (role.managed) {
        return false;
    }

    const name =
        typeof role.name === "string"
            ? role.name.toLowerCase().replace(/^@/, "")
            : "";

    if (NEVER_ASSIGNABLE_NAMES.has(name)) {
        return false;
    }

    /*
     * Any permission at all disqualifies it. These roles are meant to be
     * paint, and "it only had Manage Nicknames when we made it" is not a
     * distinction a member can verify.
     *
     * `PermissionsBitField#any()` takes a required argument and throws
     * without one, so emptiness is read off the raw bitfield instead. A shape
     * we cannot read is treated as unsafe rather than given the benefit of the
     * doubt.
     */
    const rawPermissions = role.permissions?.bitfield;

    if (
        typeof rawPermissions !== "bigint" &&
        typeof rawPermissions !== "number"
    ) {
        return false;
    }

    if (BigInt(rawPermissions) !== 0n) {
        return false;
    }

    return true;
}

/**
 * Role ids a member holds, from whichever shape the caller had to hand.
 *
 * A `GuildMember` carries a `RoleManager` whose cache may or may not be
 * populated depending on how the member was fetched, while an interaction
 * sometimes only has the raw id array. Accepting both keeps the command from
 * fetching the whole member just to read ids.
 */
function heldRoleIds(member) {
    const cached = member?.roles?.cache;

    if (cached && typeof cached.keyArray === "function") {
        return cached.keyArray().map(String);
    }

    const raw =
        Array.isArray(member?.roles)
            ? member.roles
            : [];

    return raw.map(String);
}

/**
 * The bot-created colour roles a member already holds.
 *
 * Used both to report the current colour and to take the old one off when a
 * member switches. Only receipts are consulted, so removing "the previous
 * colour" can never remove a real role the owner gave them.
 */
async function listMemberColorRoles(
    discordGuildId,
    member
) {
    if (!discordGuildId || !member) {
        return [];
    }

    const heldIds = [...new Set(heldRoleIds(member))];

    if (heldIds.length === 0) {
        return [];
    }

    return prisma.guildCosmeticRole.findMany({
        where: {
            guild: {
                discordId: discordGuildId,
            },

            discordRoleId: {
                in: heldIds,
            },
        },
    });
}

module.exports = {
    COLOR_ROLE_MODES,
    COLOR_ROLE_SOURCES,
    MAX_ROLE_NAME_LENGTH,
    normalizeHex,
    colorToInt,
    colorFromInt,
    normalizeRoleName,
    defaultRoleNameForColor,
    normalizeMode,
    getColorRoleSettings,
    updateColorRoleSettings,
    listPaletteColors,
    recordColorRole,
    isBotCreatedRole,
    forgetColorRole,
    setPaletteColor,
    resolveColorRole,
    isRoleSafeToAssign,
    listMemberColorRoles,
};
