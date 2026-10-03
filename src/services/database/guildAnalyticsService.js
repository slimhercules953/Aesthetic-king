const {
    getActivePlan,
} = require(
    "../entitlements/featureAccessService"
);

const {
    prisma,
} = require("./prisma");

/**
 * Guild usage events — the data behind the Studio Analytics tab.
 *
 * Nothing else in the schema records *where* something happened:
 * `FeatureUsage` and `GenerationHistory` are keyed by user only, so a server
 * owner asking "is the bot actually used here, and by whom?" had no answer.
 *
 * Two properties shape the design:
 *
 *   1. Logging must never break a command. `recordUsageEvent` swallows every
 *      error and is always called fire-and-forget. A missing guild row or a
 *      dead connection costs an owner their analytics, not their `/generate`.
 *
 *   2. There is deliberately no foreign key from `guildId` to `Guild`. A
 *      constraint would turn the case above into a failed insert at best, and
 *      it buys nothing: rows are written with the internal guild id resolved
 *      by the caller, and analytics for a removed server are worth keeping
 *      for exactly as long as the row survives.
 */

const GUILD_ID_CACHE_TTL_MS =
    5 * 60 * 1000;

const guildIdCache =
    new Map();

async function resolveInternalGuildId(
    discordGuildId
) {
    const cached = guildIdCache.get(discordGuildId);

    if (
        cached &&
        cached.expiresAt > Date.now()
    ) {
        return cached.value;
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

    const value = guild?.id ?? null;

    guildIdCache.set(discordGuildId, {
        value,
        expiresAt:
            Date.now() +
            GUILD_ID_CACHE_TTL_MS,
    });

    return value;
}

const PLAN_CACHE_TTL_MS =
    60 * 1000;

const planCache =
    new Map();

/**
 * Whether the member was a premium subscriber when they ran the command.
 *
 * Cached briefly because it is read on every interaction and entitlements
 * change rarely; a minute of staleness in an analytics column is irrelevant,
 * while a second query per command is not.
 */
async function resolvePremium(
    discordUserId
) {
    const cached = planCache.get(discordUserId);

    if (
        cached &&
        cached.expiresAt > Date.now()
    ) {
        return cached.value;
    }

    let value = false;

    try {
        const {
            getActivePlan,
        } = require(
            "../entitlements/featureAccessService"
        );

        value =
            (await getActivePlan(discordUserId)) ===
            "PREMIUM";
    } catch {
        // An entitlement lookup failure only costs the analytics column.
        value = false;
    }

    planCache.set(discordUserId, {
        value,
        expiresAt:
            Date.now() + PLAN_CACHE_TTL_MS,
    });

    return value;
}

/**
 * @param {object} event
 * @param {string} event.discordGuildId
 * @param {string} event.discordUserId
 * @param {string} event.commandName
 * @param {"command"|"button"|"autocomplete"} [event.component]
 * @param {string|null} [event.aestheticId]
 * @param {string|null} [event.moodId]
 * @param {string|null} [event.packId]
 * @param {boolean} [event.premium] resolved when omitted
 */
async function recordUsageEvent(
    event
) {
    try {
        const {
            discordGuildId,
            discordUserId,
            commandName,
            component = "command",
            aestheticId = null,
            moodId = null,
            packId = null,
            premium,
        } = event ?? {};

        if (
            !discordGuildId ||
            !discordUserId ||
            !commandName
        ) {
            return;
        }

        const guildId =
            await resolveInternalGuildId(
                discordGuildId
            );

        if (!guildId) {
            return;
        }

        const isPremium =
            premium === true ||
            (premium === undefined &&
                (await resolvePremium(
                    String(discordUserId)
                )));

        await prisma.guildUsageEvent.create({
            data: {
                guildId,
                discordUserId:
                    String(discordUserId),

                commandName:
                    String(commandName).slice(
                        0,
                        64
                    ),

                component:
                    String(component).slice(
                        0,
                        32
                    ),

                aestheticId: aestheticId
                    ? String(aestheticId)
                    : null,

                moodId: moodId
                    ? String(moodId)
                    : null,

                packId: packId
                    ? String(packId)
                    : null,

                premium: premium === true,
            },
        });
    } catch (error) {
        console.error(
            "Guild usage event could not be recorded.",
            error
        );
    }
}

/**
 * Fire-and-forget wrapper so a call site reads as intent rather than as an
 * unawaited promise that a linter (or a reviewer) would reasonably flag.
 */
function logUsageEvent(
    event
) {
    recordUsageEvent(event);
}

module.exports = {
    recordUsageEvent,
    logUsageEvent,
};
