const {
    Events,
    MessageFlags,
    InteractionContextType,
} = require("discord.js");

const logger =
    require("../utils/logger");

const {
    getGenerationChannelId,
} = require(
    "../services/database/guildSettingsService"
);

const {
    isGuildCommandEnabled,
} = require(
    "../services/database/guildCommandService"
);

const {
    checkGuildAccess,
} = require(
    "../services/database/guildAccessService"
);

const {
    logUsageEvent,
} = require(
    "../services/database/guildAnalyticsService"
);

const {
    applyAppearanceToInteraction,
} = require(
    "../services/database/guildAppearanceService"
);

const {
    checkCommandFeatureAccess,
    buildCommandFeatureLockedReply,
} = require(
    "../services/entitlements/commandEntitlementService"
);

const {
    checkRateLimit,
    formatRetryAfter,
} = require(
    "../services/interactions/rateLimitService"
);

const {
    buildRateLimitedEmbed,
} = require(
    "../components/embeds/systemResponse"
);

const {
    getUnseenPatchNote,
} = require(
    "../services/database/patchNoteService"
);

/**
 * Appends a one-line "something new shipped" hint to a command reply.
 *
 * The changelog already lives in the Studio bell, but the bell only reaches
 * someone who is signed in and looking. This is the part that makes the
 * release actually known: it rides along with a command the user chose to
 * run, so it needs no new attention of its own.
 *
 * Three things keep it from becoming the notification everyone learns to
 * ignore:
 *
 * - It fires at most once per user per release. `getUnseenPatchNote` latches
 *   the version in memory and records a real dismissal in
 *   `PatchNotification` the moment they run `/patch-notes`, so a second
 *   command after reading is silent.
 * - It never runs for `/patch-notes` itself, which would be circular.
 * - It is appended to the reply the user is already getting rather than sent
 *   as its own message, so a release cannot spam a channel with banners.
 *
 * Anything going wrong is swallowed. A changelog nudge is not worth turning
 * a successful command into a failed interaction.
 */
async function appendUpdateHint(
    interaction,
    commandName
) {
    if (commandName === "patch-notes") {
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        return;
    }

    const note = await getUnseenPatchNote(
        interaction.user?.id
    );

    if (!note) {
        return;
    }

    const hint =
        `📝 **${note.version}** just shipped — run ` +
        "`/patch-notes` to see what's new.";

    /*
     * The existing text has to be read back and re-sent, because editing a
     * reply replaces it wholesale and blindly setting `content` would wipe
     * whatever the command said. That costs one extra API call, and only
     * for the one command per user per release that actually shows the hint.
     */
    const existing = await interaction.fetchReply();
    const content = String(existing?.content ?? "");

    await interaction.editReply({
        content: content ? `${content}\n\n${hint}` : hint,
    });
}

/**
 * Buttons that only write a row are left on the generic scope; the reroll
 * handlers that reach the AI declare `rateLimitScope: "generation"` themselves.
 */

/**
 * Applies the per-member limiter and builds the reply when it says stop.
 *
 * Returns `null` when the action may proceed, so the call sites stay a single
 * `const blocked = ...; if (blocked) return;`.
 *
 * Keyed on the user rather than the channel or guild: the resource being
 * protected is the AI endpoint, and one member's spam should not cool down
 * their whole server.
 */
async function enforceRateLimit(
    interaction,
    scope
) {
    const result = checkRateLimit(scope, {
        guildId: interaction.guildId,
        userId: interaction.user?.id,
    });

    if (result.allowed) {
        return null;
    }

    return {
        embeds: [
            buildRateLimitedEmbed(
                formatRetryAfter(
                    result.retryAfterSeconds
                )
            ),
        ],

        flags: MessageFlags.Ephemeral,
    };
}

const {
    getState,
} = require(
    "../services/interactions/interactionStateService"
);

const {
    buildCommandDisabledEmbed,
    buildWrongChannelEmbed,
    buildAccessDeniedEmbed,
    buildInteractionErrorEmbed,
    buildUnknownComponentEmbed,
    buildGuildOnlyCommandEmbed,
} = require(
    "../components/embeds/systemResponse"
);

/**
 * A command that declares `contexts: [Guild]` is hidden from DMs by Discord
 * itself, so in practice nothing reaches `execute` outside a server. The
 * declaration lives in the command file, though, and a stale registration or a
 * command registered before the context was set can still slip through, so the
 * pipeline re-checks it. Without this, a guild-only command run in a DM would
 * skip the generation-channel rule entirely — that check needs a guild.
 */
function isGuildOnlyCommand(command) {
    const contexts =
        command?.data?.contexts ??
        command?.data?.toJSON?.().contexts;

    return (
        Array.isArray(contexts) &&
        contexts.length > 0 &&
        contexts.every(
            (context) =>
                context === InteractionContextType.Guild
        )
    );
}

/**
 * Server access rules apply to everything a member can trigger, not just
 * slash commands — a reroll button is just as much a request to the bot.
 */
async function resolveGuildAccess(
    interaction
) {
    if (!interaction.guildId) {
        return { allowed: true };
    }

    /**
     * `member.roles` is a manager, not a list, and for a guild the bot has
     * not been granted the GUILD_MEMBERS intent for it collapses to just
     * @everyone. `_roles` is the raw id array Discord sent with the
     * interaction, which is always present and always current, so it wins.
     */
    const member =
        interaction.member;

    const roleIds =
        Array.isArray(member?._roles)
            ? member._roles
            : member?.roles?.cache
                ? Array.from(
                      member.roles.cache.keys()
                  )
                : [];

    return checkGuildAccess({
        discordGuildId:
            interaction.guildId,

        roleIds,
        channelId:
            interaction.channelId ?? null,
    });
}

module.exports = {
    name: Events.InteractionCreate,

    async execute(
        client,
        interaction
    ) {
        try {
            if (
                interaction.isAutocomplete()
            ) {
                const command =
                    client.commands.get(
                        interaction.commandName
                    );

                if (
                    !command ||
                    typeof command.autocomplete !==
                        "function"
                ) {
                    return;
                }

                await command.autocomplete(
                    interaction,
                    client
                );

                return;
            }

            /*
             * Server Appearance is applied by wrapping the interaction's
             * reply/update methods once, here, so every command and button
             * is styled without each builder having to know about it.
             */
            applyAppearanceToInteraction(interaction);

            if (
                interaction.isChatInputCommand()
            ) {
                const command =
                    client.commands.get(
                        interaction.commandName
                    );

                if (!command) {
                    logger.warn(
                        `Command not found: ${interaction.commandName}`
                    );

                    return;
                }

                /*
                 * Guild-only commands are filtered out of the DM picker by
                 * Discord, so this is the backstop for a registration that is
                 * older than the command's current context declaration.
                 */
                if (
                    !interaction.guildId &&
                    isGuildOnlyCommand(command)
                ) {
                    await interaction.reply({
                        embeds: [
                            buildGuildOnlyCommandEmbed(),
                        ],

                        flags:
                            MessageFlags.Ephemeral,
                    });

                    return;
                }

                if (
                    interaction.guildId &&
                    interaction.commandName !==
                        "ping"
                ) {
                    const enabled =
                        await isGuildCommandEnabled(
                            interaction.guildId,
                            interaction.commandName
                        );

                    if (!enabled) {
                        await interaction.reply({
                            embeds: [
                                buildCommandDisabledEmbed(
                                    interaction.commandName
                                ),
                            ],

                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }
                }

                /*
                 * Access rules sit after the per-command switch and before the
                 * generation-channel check: "may this member use the bot at
                 * all" is the coarser question, and answering it first keeps a
                 * restricted member from learning which channel is configured.
                 * `ping` is exempt for the same reason it skips the command
                 * switch — it is a diagnostic, not a feature.
                 */
                if (
                    interaction.guildId &&
                    interaction.commandName !==
                        "ping"
                ) {
                    const access =
                        await resolveGuildAccess(
                            interaction
                        );

                    if (!access.allowed) {
                        await interaction.reply({
                            embeds: [
                                buildAccessDeniedEmbed(
                                    access.deniedBy
                                ),
                            ],

                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }
                }

                /*
                 * Personal entitlements sit after the guild rules and before
                 * the channel restriction: "is this command on in this server"
                 * is the server owner's call and answers first, then "may this
                 * person use it", then "is this the right channel". Unlike the
                 * two checks above it, this one is user-scoped, so it also runs
                 * in DMs.
                 *
                 * It is enforced here rather than inside `execute` for the same
                 * reason `requireGenerationChannel` is: a command cannot ship
                 * without it by forgetting a line, and the reply has not been
                 * deferred yet, so the upsell can be ephemeral.
                 */
                const entitlement =
                    await checkCommandFeatureAccess(
                        command,
                        interaction.user?.id
                    );

                if (!entitlement.allowed) {
                    await interaction.reply(
                        buildCommandFeatureLockedReply(
                            entitlement
                        )
                    );

                    return;
                }

                if (
                    command.requireGenerationChannel &&
                    interaction.guildId
                ) {
                    const generationChannelId =
                        await getGenerationChannelId(
                            interaction.guildId
                        );

                    if (
                        generationChannelId &&
                        interaction.channelId !==
                            generationChannelId
                    ) {
                        await interaction.reply({
                            embeds: [
                                buildWrongChannelEmbed(
                                    generationChannelId
                                ),
                            ],

                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }
                }

                /*
                 * The limiter runs last among the pre-flight checks so a
                 * request that was going to be refused anyway does not burn
                 * one of the member's hits. It is still before `execute`,
                 * which is the only place it can be: once generation has
                 * started the cost is already paid.
                 */
                const commandBlocked =
                    await enforceRateLimit(
                        interaction,
                        command.rateLimitScope ??
                            "command"
                    );

                if (commandBlocked) {
                    await interaction.reply(
                        commandBlocked
                    );

                    return;
                }

                await command.execute(
                    interaction,
                    client
                );

                /*
                 * Best-effort and deliberately after `execute`: the user
                 * should get their own result first, and if the hint fails
                 * the command has already succeeded.
                 */
                try {
                    await appendUpdateHint(
                        interaction,
                        interaction.commandName
                    );
                } catch {
                    /*
                     * Swallowed on purpose. The common cause is the reply
                     * having been deleted between `execute` and here, which
                     * is not a problem worth logging at any level.
                     */
                }

                /*
                 * Logged after the command resolves so the aesthetic, mood and
                 * pack recorded here are the ones the command actually used.
                 * `resolveGenerationContext` publishes them onto the
                 * interaction; a command that never resolves a context simply
                 * logs without them.
                 */
                if (interaction.guildId) {
                    const usage =
                        interaction.aestheticUsage ??
                        {};

                    logUsageEvent({
                        discordGuildId:
                            interaction.guildId,

                        discordUserId:
                            interaction.user?.id,

                        commandName:
                            interaction.commandName,

                        component: "command",

                        aestheticId:
                            usage.aestheticId ?? null,

                        moodId:
                            usage.moodId ?? null,

                        packId: usage.packId ?? null,
                    });
                }

                return;
            }

            if (
                interaction.isButton()
            ) {
                const baseCustomId =
                    interaction.customId
                        .split(":")
                        .slice(0, 2)
                        .join(":");

                const buttonHandler =
                    client.buttons.get(
                        baseCustomId
                    );

                if (
                    !buttonHandler
                ) {
                    logger.warn(
                        `Button handler not found: ${interaction.customId}`
                    );

                    /*
                     * A silent return here leaves the member's click spinning
                     * with no feedback at all, which reads as the bot being
                     * broken. The id almost always belongs to an embed from a
                     * previous deploy, so say that instead.
                     */
                    const response = {
                        embeds: [
                            buildUnknownComponentEmbed(),
                        ],

                        flags:
                            MessageFlags.Ephemeral,
                    };

                    if (
                        interaction.replied ||
                        interaction.deferred
                    ) {
                        await interaction.followUp(
                            response
                        );
                    } else {
                        await interaction.reply(
                            response
                        );
                    }

                    return;
                }

                /*
                 * Reroll buttons re-run generation, so they are subject to the
                 * same access rules as the command that made them. Without
                 * this, a restricted member could keep generating from an
                 * embed posted before the rule existed.
                 */
                if (interaction.guildId) {
                    const access =
                        await resolveGuildAccess(
                            interaction
                        );

                    if (!access.allowed) {
                        await interaction.reply({
                            embeds: [
                                buildAccessDeniedEmbed(
                                    access.deniedBy
                                ),
                            ],

                            flags:
                                MessageFlags.Ephemeral,
                        });

                        return;
                    }
                }

                /*
                 * Same limiter as commands, on the same user key, so hammering
                 * a reroll button and running the command draw from one
                 * allowance instead of two.
                 */
                const buttonBlocked =
                    await enforceRateLimit(
                        interaction,
                        buttonHandler.rateLimitScope ??
                            "command"
                    );

                if (buttonBlocked) {
                    await interaction.reply(
                        buttonBlocked
                    );

                    return;
                }

                await buttonHandler.execute(
                    interaction,
                    client
                );

                if (interaction.guildId) {
                    /*
                     * Reroll handlers recover their aesthetic/mood/pack from
                     * the interaction-state entry encoded in the custom id, so
                     * the analytics ids come from the same place the reroll
                     * itself reads them.
                     */
                    const stateId =
                        interaction.customId.split(
                            ":"
                        )[2];

                    const state = stateId
                        ? getState(stateId)
                        : null;

                    const data =
                        state?.data ?? {};

                    logUsageEvent({
                        discordGuildId:
                            interaction.guildId,

                        discordUserId:
                            interaction.user?.id,

                        commandName: baseCustomId,

                        component: "button",

                        aestheticId:
                            data.aestheticId ?? null,

                        moodId:
                            data.moodId ??
                            data.mood ??
                            null,

                        packId: data.packId ?? null,
                    });
                }
            }
        } catch (error) {
            logger.error(
                "Interaction execution failed.",
                error
            );

            if (
                interaction.isAutocomplete()
            ) {
                try {
                    await interaction.respond(
                        []
                    );
                } catch {
                    /* the interaction is already gone */
                }

                return;
            }

            const response = {
                embeds: [
                    buildInteractionErrorEmbed(),
                ],

                flags:
                    MessageFlags.Ephemeral,
            };

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                await interaction.followUp(
                    response
                );
            } else {
                await interaction.reply(
                    response
                );
            }
        }
    },
};
