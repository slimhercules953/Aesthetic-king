const {
    Events,
    MessageFlags,
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
    getState,
} = require(
    "../services/interactions/interactionStateService"
);

const {
    buildCommandDisabledEmbed,
    buildWrongChannelEmbed,
    buildAccessDeniedEmbed,
    buildInteractionErrorEmbed,
} = require(
    "../components/embeds/systemResponse"
);

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

                await command.execute(
                    interaction,
                    client
                );

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
                } catch {}

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
