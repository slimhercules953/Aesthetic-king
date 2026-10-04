const {
    SlashCommandBuilder,
    InteractionContextType,
    PermissionFlagsBits,
    MessageFlags,
    EmbedBuilder,
} = require("discord.js");

const {
    COLOR_ROLE_MODES,
    COLOR_ROLE_SOURCES,
    normalizeHex,
    getColorRoleSettings,
    updateColorRoleSettings,
    listPaletteColors,
    recordColorRole,
    isBotCreatedRole,
    setPaletteColor,
    resolveColorRole,
    isRoleSafeToAssign,
    listMemberColorRoles,
} = require("../../services/database/guildColorRoleService");

/*
 * `/color` — a member picks their own name colour.
 *
 * Everything dangerous about this feature is handled in
 * `guildColorRoleService`, and the two rules that matter most are visible
 * right here in the flow: a role is only ever assigned if the bot has a
 * receipt for it, and a role is only ever assigned if it still carries no
 * permissions. Those are checked against live Discord state at the moment of
 * assignment, not against what was true when the role was made, because an
 * owner editing roles in Discord is the normal case rather than the edge case.
 *
 * The feature is off until a server owner turns it on. A bot that gains
 * Manage Roles on a re-invite must not start handing out colours nobody
 * asked for.
 */

const MANAGE_HINT =
    "A server admin can turn it on with **/color config enable**.";

/**
 * The colour of the reply embed.
 *
 * Deliberately not the member's own colour: reporting a problem in the same
 * colour that caused it reads as a success message.
 */
const NOTICE_COLOR = 0x8b5cf6;

function denied(message) {
    return {
        content: message,
        flags: MessageFlags.Ephemeral,
    };
}

function parseHexOrReply(raw) {
    const color = normalizeHex(raw);

    if (!color) {
        return {
            error:
                "That is not a color I understand. Use six digits like **#C084FC**.",
        };
    }

    return { color };
}

/**
 * Whether the bot can actually do any of this in this guild right now.
 *
 * Checked per-use rather than at startup because the answer can change
 * without a restart — an owner revokes the permission, or the bot's own role
 * is dragged below one it needs to assign.
 */
function checkBotCapabilities(interaction) {
    const me = interaction.guild?.members?.me;

    if (!me) {
        return {
            ok: false,
            error:
                "I could not check my own permissions here. Try again in a moment.",
        };
    }

    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return {
            ok: false,
            error:
                "I need the **Manage Roles** permission to hand out colors. An admin can grant it in Server Settings → Roles.",
        };
    }

    return { ok: true, me };
}

/**
 * Whether the bot's highest role sits above the role it is about to touch.
 *
 * Discord refuses the write outright otherwise, and the error it returns is
 * a bare 50003 that means nothing to a member. Saying "an admin needs to move
 * my role up" is the difference between a fixable report and a bug thread.
 */
function botOutranks(me, role) {
    if (!me?.roles?.highest || !role) {
        return false;
    }

    return me.roles.highest.position > role.position;
}

async function buildSetReply(
    interaction,
    role,
    color,
    created
) {
    const embed = new EmbedBuilder()
        .setColor(NOTICE_COLOR)
        .setDescription(
            `Your name color is now ${color}.`
        )
        .addFields({
            name: "Role",
            value: `${role.name} \`${color}\``,
        });

    if (created) {
        embed.addFields({
            name: "Note",
            value:
                "I made a new role for this color. Anyone else who picks the same color shares it, so the server does not fill up with one role per person.",
        });
    }

    embed.setFooter({
        text: "Aesthetic King • /color",
    });

    return { embeds: [embed] };
}

/* ------------------------------------------------------------------ *
 * Subcommand handlers
 * ------------------------------------------------------------------ */

async function handleSet(interaction) {
    const settings =
        await getColorRoleSettings(interaction.guildId);

    if (!settings.enabled) {
        await interaction.reply(
            denied(
                `❌ Member color roles are turned off in this server. ${MANAGE_HINT}`
            )
        );

        return;
    }

    const parsed = parseHexOrReply(
        interaction.options.getString("color")
    );

    if (parsed.error) {
        await interaction.reply(
            denied(parsed.error)
        );

        return;
    }

    const { color } = parsed;

    /*
     * Which role to hand out, once we know. Null means "whatever role already
     * carries this colour, or make a new one".
     */
    let preferredRoleId = null;

    /*
     * In PALETTE mode the member is choosing from a list an owner curated, so
     * the hex has to match one of those entries exactly. Matching on the
     * normalised hex rather than the role name is what stops a member from
     * getting an unlisted colour by naming a role that happens to exist.
     */
    if (settings.mode === COLOR_ROLE_MODES.PALETTE) {
        const palette =
            await listPaletteColors(interaction.guildId);

        const match = palette.find(
            (entry) =>
                normalizeHex(entry.color) === color
        );

        if (!match) {
            const listed = palette
                .slice(0, 12)
                .map((entry) => entry.color)
                .join(", ");

            await interaction.reply(
                denied(
                    `❌ **${color}** is not in this server's palette.` +
                        (listed
                            ? `\nAvailable: ${listed}`
                            : "\nNo colors have been approved yet, so ask an admin to add some with **/color config palette-add**.")
                )
            );

            return;
        }

        /*
         * The approved role itself, not merely "a role with this colour".
         * Two roles can share a hex, and the member approved one of them;
         * handing them the other would be a surprise even when the colour
         * matches.
         */
        preferredRoleId = String(match.discordRoleId);
    }

    const capabilities =
        checkBotCapabilities(interaction);

    if (!capabilities.ok) {
        await interaction.reply(
            denied(capabilities.error)
        );

        return;
    }

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
    });

    const resolved = await resolveColorRole(
        interaction.guildId,
        color,
        {
            name: interaction.options.getString("name"),
            preferredRoleId,
        }
    );

    if (!resolved.ok) {
        await interaction.editReply({
            content: resolved.error,
        });

        return;
    }

    let discordRole = null;
    let created = false;

    if (resolved.needsCreation) {
        const roles = interaction.guild.roles.cache;

        /*
         * Discord caps a guild at 250 roles and the member list at 250
         * *coloured* roles. Refusing before the create is kinder than
         * surfacing a 30005, and points at the fix.
         */
        if (roles.size >= 250) {
            await interaction.editReply({
                content:
                    "❌ This server has hit Discord's 250-role limit, so I cannot make a role for that color. An admin could free one up, or pick a color someone else already used.",
            });

            return;
        }

        try {
            /*
             * No permissions, not hoisted, not mentionable. This is the only
             * place a role is created on a member's say-so, so it is created
             * as inert as Discord allows.
             */
            discordRole =
                await interaction.guild.roles.create({
                    name: resolved.name,
                    color: resolved.color,
                    permissions: [],
                    hoist: false,
                    mentionable: false,
                    reason: `/color: requested by ${interaction.user.tag}`,
                });
        } catch {
            await interaction.editReply({
                content:
                    "❌ Discord would not let me create that role. If the name is already taken by another role, try `/color set` again — I reuse existing color roles where I can.",
            });

            return;
        }

        created = true;

        /*
         * The receipt is written immediately after the create. If that write
         * fails the role exists but the bot does not know it made it, which
         * is the safe direction: the bot will never touch a role it cannot
         * account for. The orphan is visible to an owner and harmless.
         */
        await recordColorRole(
            interaction.guildId,
            {
                id: discordRole.id,
                name: discordRole.name,
                color: resolved.color,
            },
            {
                createdBy: interaction.user.id,
                source: COLOR_ROLE_SOURCES.COMMAND,
                selfAssignable: false,
            }
        );
    } else {
        const known =
            await isBotCreatedRole(
                interaction.guildId,
                resolved.role.discordRoleId
            );

        if (!known) {
            await interaction.editReply({
                content:
                    "❌ Something is inconsistent about that color role, so I will not assign it. Ask an admin to re-add it with **/color config palette-add**.",
            });

            return;
        }

        discordRole = interaction.guild.roles.cache.get(
            resolved.role.discordRoleId
        );

        if (!discordRole) {
            /*
             * The receipt outlived the role — deleted in Discord since it was
             * made. Offering it again would fail on every attempt, so the row
             * is dropped here rather than left to rot.
             */
            await setPaletteColor(
                interaction.guildId,
                resolved.role.discordRoleId,
                false
            );

            await interaction.editReply({
                content:
                    "❌ That color's role no longer exists in this server. Run the command again and I will make a fresh one.",
            });

            return;
        }
    }

    if (!isRoleSafeToAssign(discordRole)) {
        await interaction.editReply({
            content:
                "❌ That role has permissions attached to it, so I will not hand it out as a color. Ask an admin to sort it out.",
        });

        return;
    }

    if (!botOutranks(capabilities.me, discordRole)) {
        await interaction.editReply({
            content:
                "❌ My highest role sits below that color role, so Discord will not let me assign it. An admin needs to drag my role above it in Server Settings → Roles.",
        });

        return;
    }

    const member =
        await interaction.guild.members.fetch(
            interaction.user.id
        );

    /*
     * Only bot-created roles are removed. A member may hold real roles from
     * the owner; "switch my colour" must never quietly strip one of those,
     * which is why the removal list comes from the receipt table rather than
     * from anything that looks like a colour.
     */
    const previous =
        await listMemberColorRoles(
            interaction.guildId,
            member
        );

    const toRemove = previous
        .map((row) => String(row.discordRoleId))
        .filter(
            (id) => id !== String(discordRole.id)
        );

    try {
        if (toRemove.length > 0) {
            await member.roles.remove(
                toRemove,
                "/color: replacing the previous color"
            );
        }

        await member.roles.add(
            discordRole.id,
            "/color: member-chosen color"
        );
    } catch {
        await interaction.editReply({
            content:
                "❌ Discord refused the change. That usually means my role is positioned below the one I was trying to assign, or the color role is above my highest role.",
        });

        return;
    }

    await interaction.editReply(
        await buildSetReply(
            interaction,
            discordRole,
            color,
            created
        )
    );
}

async function handleRemove(interaction) {
    await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
    });

    const member =
        await interaction.guild.members.fetch(
            interaction.user.id
        );

    const previous =
        await listMemberColorRoles(
            interaction.guildId,
            member
        );

    if (previous.length === 0) {
        await interaction.editReply({
            content:
                "You do not have a color role from me right now.",
        });

        return;
    }

    const capabilities =
        checkBotCapabilities(interaction);

    if (!capabilities.ok) {
        await interaction.editReply({
            content: capabilities.error,
        });

        return;
    }

    const ids = previous
        .map((row) => String(row.discordRoleId))
        .filter((id) => {
            const role =
                interaction.guild.roles.cache.get(id);

            return role && botOutranks(
                capabilities.me,
                role
            );
        });

    if (ids.length === 0) {
        await interaction.editReply({
            content:
                "❌ My highest role sits below your color role, so Discord will not let me remove it. An admin needs to move my role up.",
        });

        return;
    }

    try {
        await member.roles.remove(
            ids,
            "/color remove: member cleared their color"
        );
    } catch {
        await interaction.editReply({
            content:
                "❌ Discord refused to remove the role. Try again, or ask an admin.",
        });

        return;
    }

    await interaction.editReply({
        content:
            `✅ Removed **${previous.length}** color role${previous.length === 1 ? "" : "s"}. Your name is back to the default color.`,
    });
}

async function handleShow(interaction) {
    const member =
        await interaction.guild.members.fetch(
            interaction.user.id
        );

    const [settings, previous, palette] =
        await Promise.all([
            getColorRoleSettings(interaction.guildId),
            listMemberColorRoles(
                interaction.guildId,
                member
            ),
            listPaletteColors(interaction.guildId),
        ]);

    const embed = new EmbedBuilder()
        .setColor(NOTICE_COLOR)
        .setTitle("🎨 Member colors")
        .addFields(
            {
                name: "Status",
                value: settings.enabled
                    ? "Enabled"
                    : `Disabled. ${MANAGE_HINT}`,
                inline: true,
            },
            {
                name: "Mode",
                value: settings.enabled
                    ? settings.mode === COLOR_ROLE_MODES.PALETTE
                        ? "Curated palette — approved colors only"
                        : "Free — any hex color"
                    : "—",
                inline: true,
            }
        );

    if (previous.length > 0) {
        embed.addFields({
            name: "Your current color",
            value: previous
                .map(
                    (row) =>
                        `${row.color} — ${row.name}`
                )
                .join("\n"),
        });
    } else {
        embed.addFields({
            name: "Your current color",
            value: "None. Use **/color set** to pick one.",
        });
    }

    if (settings.enabled) {
        embed.addFields({
            name: "How to pick one",
            value:
                settings.mode === COLOR_ROLE_MODES.PALETTE
                    ? "**/color set** with one of the approved colors below."
                    : "**/color set** `color:#C084FC` — any hex you like.",
        });
    }

    if (palette.length > 0) {
        embed.addFields({
            name: "Approved colors",
            value: palette
                .slice(0, 15)
                .map(
                    (entry) =>
                        `\`${entry.color}\` ${entry.name}`
                )
                .join("\n"),
        });
    }

    embed.setFooter({
        text: "Aesthetic King • /color",
    });

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
    });
}

async function handlePalette(interaction) {
    const palette =
        await listPaletteColors(interaction.guildId);

    if (palette.length === 0) {
        await interaction.reply(
            denied(
                "No colors have been approved for this server yet. An admin adds them with **/color config palette-add**."
            )
        );

        return;
    }

    const embed = new EmbedBuilder()
        .setColor(NOTICE_COLOR)
        .setTitle("🎨 Approved colors")
        .setDescription(
            `Pick one with **/color set** \`color:#\`.`
        )
        .addFields({
            name: "Colors",
            value: palette
                .slice(0, 25)
                .map(
                    (entry) =>
                        `\`${entry.color}\` ${entry.name}`
                )
                .join("\n"),
        })
        .setFooter({
            text: "Aesthetic King • /color",
        });

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
    });
}

/* ------------------------------------------------------------------ *
 * Owner configuration
 * ------------------------------------------------------------------ */

async function handleConfigEnable(interaction) {
    const enabled =
        interaction.options.getBoolean("state");

    const settings =
        await updateColorRoleSettings(
            interaction.guildId,
            { enabled }
        );

    const capabilities =
        checkBotCapabilities(interaction);

    const lines = [
        enabled
            ? `✅ Member colors are **on** (${settings.mode}).`
            : "✅ Member colors are **off**.",
    ];

    if (enabled && !capabilities.ok) {
        lines.push(
            `⚠️ ${capabilities.error}`
        );
    }

    if (enabled) {
        lines.push(
            settings.mode === COLOR_ROLE_MODES.PALETTE
                ? "Members can only use approved colors — add some with **/color config palette-add**."
                : "Members can now run **/color set** with any hex color."
        );
    }

    await interaction.reply(
        denied(lines.join("\n"))
    );
}

async function handleConfigMode(interaction) {
    const mode =
        interaction.options.getString("mode");

    const settings =
        await updateColorRoleSettings(
            interaction.guildId,
            { mode }
        );

    await interaction.reply(
        denied(
            `✅ Member colors now use **${settings.mode}** mode. ` +
                (settings.mode === COLOR_ROLE_MODES.PALETTE
                    ? "Members can only pick colors you have approved."
                    : "Members can pick any hex color.")
        )
    );
}

async function handleConfigPaletteAdd(
    interaction
) {
    const parsed = parseHexOrReply(
        interaction.options.getString("color")
    );

    if (parsed.error) {
        await interaction.reply(
            denied(parsed.error)
        );

        return;
    }

    const { color } = parsed;

    const capabilities =
        checkBotCapabilities(interaction);

    if (!capabilities.ok) {
        await interaction.reply(
            denied(capabilities.error)
        );

        return;
    }

    await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
    });

    /*
     * If a role already carries this colour and the bot made it, approve that
     * one rather than making a duplicate. Two roles with identical colours is
     * exactly the clutter this feature is meant to avoid.
     */
    const palette =
        await listPaletteColors(interaction.guildId);

    const alreadyListed = palette.find(
        (entry) =>
            normalizeHex(entry.color) === color
    );

    if (alreadyListed) {
        await interaction.editReply({
            content:
                `✅ **${color}** is already in the palette as **${alreadyListed.name}**.`,
        });

        return;
    }

    const existing =
        interaction.guild.roles.cache.find(
            (role) =>
                role.hexColor?.toUpperCase() === color
        );

    let roleId = null;
    let roleName = null;

    if (existing) {
        /*
         * A matching role exists but may not be ours. Only a role with a
         * receipt can be approved, otherwise "add this colour to the palette"
         * becomes "approve Administrator, but it happens to be red".
         */
        const known = await isBotCreatedRole(
            interaction.guildId,
            existing.id
        );

        if (!known) {
            await interaction.editReply({
                content:
                    `❌ There is already a role called **${existing.name}** with that color, but I did not create it, so I will not add it to the palette. Pick a different color.`,
            });

            return;
        }

        if (!isRoleSafeToAssign(existing)) {
            await interaction.editReply({
                content:
                    `❌ **${existing.name}** has permissions attached to it, so it is not a safe color role. Remove its permissions in Server Settings → Roles, or pick another color.`,
            });

            return;
        }

        roleId = existing.id;
        roleName = existing.name;
    } else {
        if (interaction.guild.roles.cache.size >= 250) {
            await interaction.editReply({
                content:
                    "❌ This server has hit Discord's 250-role limit, so I cannot make a role for that color.",
            });

            return;
        }

        const name =
            interaction.options.getString("name") ??
            color;

        try {
            const role =
                await interaction.guild.roles.create({
                    name,
                    color,
                    permissions: [],
                    hoist: false,
                    mentionable: false,
                    reason:
                        `/color config palette-add by ${interaction.user.tag}`,
                });

            roleId = role.id;
            roleName = role.name;
        } catch {
            await interaction.editReply({
                content:
                    "❌ Discord would not let me create that role. Check the name is not already taken.",
            });

            return;
        }
    }

    await recordColorRole(
        interaction.guildId,
        {
            id: roleId,
            name: roleName,
            color,
        },
        {
            createdBy: interaction.user.id,
            source: COLOR_ROLE_SOURCES.COMMAND,
            selfAssignable: true,
        }
    );

    await interaction.editReply({
        content:
            `✅ Added **${color}** (**${roleName}**) to the palette. ` +
            "Members can pick it with **/color set**.",
    });
}

async function handleConfigPaletteRemove(
    interaction
) {
    const role =
        interaction.options.getRole("role");

    const changed = await setPaletteColor(
        interaction.guildId,
        role.id,
        false
    );

    if (!changed) {
        await interaction.reply(
            denied(
                `❌ I did not create **${role.name}**, so it was never in my palette.`
            )
        );

        return;
    }

    await interaction.reply(
        denied(
            `✅ Removed **${role.name}** from the palette. Anyone who already has it keeps it until they change it.`
        )
    );
}

async function handleConfigList(
    interaction
) {
    const [settings, palette] =
        await Promise.all([
            getColorRoleSettings(interaction.guildId),
            listPaletteColors(interaction.guildId),
        ]);

    const embed = new EmbedBuilder()
        .setColor(NOTICE_COLOR)
        .setTitle("⚙️ Color settings")
        .addFields(
            {
                name: "Enabled",
                value: settings.enabled
                    ? "Yes"
                    : "No",
                inline: true,
            },
            {
                name: "Mode",
                value: settings.mode,
                inline: true,
            },
            {
                name: "Approved colors",
                value: palette.length > 0
                    ? palette
                        .slice(0, 20)
                        .map(
                            (entry) =>
                                `\`${entry.color}\` ${entry.name}`
                        )
                        .join("\n")
                    : "None yet. Add one with **/color config palette-add**.",
            }
        )
        .setFooter({
            text: "Aesthetic King • /color",
        });

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
    });
}

/* ------------------------------------------------------------------ *
 * Command definition
 * ------------------------------------------------------------------ */

const configGroup = {
    name: "config",
    description:
        "Server settings for member color roles (requires Manage Server).",
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("color")
        .setDescription(
            "Pick your own name color in this server."
        )
        .addSubcommand((sub) =>
            sub
                .setName("set")
                .setDescription(
                    "Give yourself a color role."
                )
                .addStringOption((option) =>
                    option
                        .setName("color")
                        .setDescription(
                            "A hex color like #C084FC."
                        )
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription(
                            "Optional name for a new color role."
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("remove")
                .setDescription(
                    "Take your color role back off."
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("show")
                .setDescription(
                    "Show your current color and what is available."
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("palette")
                .setDescription(
                    "List the colors approved for this server."
                )
        )
        .addSubcommandGroup((group) =>
            group
                .setName(configGroup.name)
                .setDescription(configGroup.description)
                .addSubcommand((sub) =>
                    sub
                        .setName("enable")
                        .setDescription(
                            "Turn member color roles on or off."
                        )
                        .addBooleanOption((option) =>
                            option
                                .setName("state")
                                .setDescription(
                                    "On or off."
                                )
                                .setRequired(true)
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName("mode")
                        .setDescription(
                            "Choose whether members pick any hex or only approved colors."
                        )
                        .addStringOption((option) =>
                            option
                                .setName("mode")
                                .setDescription(
                                    "FREE lets members type any hex. PALETTE restricts them to approved colors."
                                )
                                .setRequired(true)
                                .addChoices(
                                    {
                                        name:
                                            "Free — any hex color",
                                        value:
                                            COLOR_ROLE_MODES.FREE,
                                    },
                                    {
                                        name:
                                            "Palette — approved colors only",
                                        value:
                                            COLOR_ROLE_MODES.PALETTE,
                                    }
                                )
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName("palette-add")
                        .setDescription(
                            "Approve a color members can choose."
                        )
                        .addStringOption((option) =>
                            option
                                .setName("color")
                                .setDescription(
                                    "A hex color like #C084FC."
                                )
                                .setRequired(true)
                        )
                        .addStringOption((option) =>
                            option
                                .setName("name")
                                .setDescription(
                                    "Name for the role if a new one is needed."
                                )
                                .setRequired(false)
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName("palette-remove")
                        .setDescription(
                            "Stop offering a color to members."
                        )
                        .addRoleOption((option) =>
                            option
                                .setName("role")
                                .setDescription(
                                    "The color role to remove from the palette."
                                )
                                .setRequired(true)
                        )
                )
                .addSubcommand((sub) =>
                    sub
                        .setName("list")
                        .setDescription(
                            "Show the current color settings."
                        )
                )
        )
        // Roles, permissions and the member list are all guild concepts;
        // there is nothing for this command to do in a DM.
        .setContexts(InteractionContextType.Guild)
        /*
         * `null` rather than a permission bit: the whole point is that an
         * ordinary member can pick their own colour, and any default member
         * permission here would hide the command from exactly those people.
         * The owner-only `config` group is gated in `execute` instead.
         */
        .setDefaultMemberPermissions(null),

    async execute(interaction) {
        /*
         * `setDefaultMemberPermissions` hides the command from members who
         * cannot manage roles, which is wrong for the member-facing half —
         * everyone should be able to pick a colour. So the gate is declared on
         * the config group only, and this is the second line of defence for
         * the owner-only paths in case a stale registration or a custom
         * server-side permission override lets someone through.
         */
        const group = interaction.options.getSubcommand(
            true
        );

        const isConfig =
            interaction.options.getSubcommandGroup?.() ===
            "config";

        if (
            isConfig &&
            !interaction.memberPermissions?.has(
                PermissionFlagsBits.ManageGuild
            )
        ) {
            await interaction.reply(
                denied(
                    "❌ You need the **Manage Server** permission to change color settings."
                )
            );

            return;
        }

        switch (group) {
            case "set":
                await handleSet(interaction);
                break;

            case "remove":
                await handleRemove(interaction);
                break;

            case "show":
                await handleShow(interaction);
                break;

            case "palette":
                await handlePalette(interaction);
                break;

            case "enable":
                await handleConfigEnable(interaction);
                break;

            case "mode":
                await handleConfigMode(interaction);
                break;

            case "palette-add":
                await handleConfigPaletteAdd(interaction);
                break;

            case "palette-remove":
                await handleConfigPaletteRemove(
                    interaction
                );
                break;

            case "list":
                await handleConfigList(interaction);
                break;

            default:
                await interaction.reply(
                    denied(
                        "✦ I do not know that color subcommand yet."
                    )
                );
        }
    },
};
