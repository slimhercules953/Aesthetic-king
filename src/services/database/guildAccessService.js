const {
    prisma,
} = require("./prisma");

/**
 * Server access rules.
 *
 * A rule narrows who may drive Aesthetic King inside a guild. Rules are
 * deliberately coarse — roles and channels — because the person configuring
 * them is a server owner answering "which of my staff can summon the bot",
 * not writing a policy engine.
 *
 * Evaluation, in order:
 *   1. no rules at all            -> open (the default for every existing server)
 *   2. a matching DENY rule       -> denied, unconditionally
 *   3. ALLOW rules exist          -> allowed only if one of them matches
 *   4. otherwise                  -> open
 *
 * Deny beating allow means an owner can carve an exception out of a broad
 * allow without reasoning about rule ordering.
 */

const CACHE_TTL_MS =
    15 * 1000;

const cache =
    new Map();

function readCache(guildId) {
    const entry = cache.get(guildId);

    if (!entry) {
        return null;
    }

    if (entry.expiresAt <= Date.now()) {
        cache.delete(guildId);
        return null;
    }

    return entry.rules;
}

/**
 * Rules are read on every command, which is far too often for a table that
 * changes a few times a week. Fifteen seconds is short enough that an owner
 * flipping a rule in Studio sees it take effect almost immediately, and long
 * enough that a busy guild stops hammering the database.
 */
async function getAccessRules(
    discordGuildId
) {
    if (!discordGuildId) {
        return [];
    }

    const cached = readCache(discordGuildId);

    if (cached) {
        return cached;
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

    if (!guild) {
        return [];
    }

    const rows =
        await prisma.guildAccessRule.findMany({
            where: {
                guildId: guild.id,
            },
        });

    const rules = rows.map((row) => ({
        kind: row.kind,
        effect: row.effect,
        targetId: row.targetId,
    }));

    cache.set(discordGuildId, {
        rules,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return rules;
}

function normalize(value) {
    return String(value ?? "");
}

/**
 * @returns {Promise<{ allowed: boolean, deniedBy: string | null }>}
 *
 * Fails open. A database blip should not stop a server from generating
 * images; the worst case is that a restriction is briefly not enforced, which
 * is strictly better than the bot appearing broken to every member.
 */
async function checkGuildAccess({
    discordGuildId,
    roleIds = [],
    channelId = null,
}) {
    if (!discordGuildId) {
        return { allowed: true, deniedBy: null };
    }

    let rules;

    try {
        rules = await getAccessRules(
            discordGuildId
        );
    } catch (error) {
        console.error(
            "Guild access rules could not be loaded; allowing the interaction.",
            error
        );

        return { allowed: true, deniedBy: null };
    }

    if (rules.length === 0) {
        return { allowed: true, deniedBy: null };
    }

    const memberRoles = new Set(
        (roleIds ?? []).map((id) => String(id))
    );

    const channel = channelId
        ? String(channelId)
        : null;

    const matches = (rule) => {
        if (rule.kind === "ROLE") {
            return memberRoles.has(
                normalize(rule.targetId)
            );
        }

        if (rule.kind === "CHANNEL") {
            return (
                channel !== null &&
                channel === normalize(rule.targetId)
            );
        }

        return false;
    };

    const denial = rules.find(
        (rule) =>
            String(rule.effect).toUpperCase() ===
                "DENY" && matches(rule)
    );

    if (denial) {
        return {
            allowed: false,
            deniedBy: denial.kind,
        };
    }

    const hasAllow = rules.some(
        (rule) =>
            String(rule.effect).toUpperCase() ===
            "ALLOW"
    );

    if (!hasAllow) {
        return { allowed: true, deniedBy: null };
    }

    const allowed = rules.some(
        (rule) =>
            String(rule.effect).toUpperCase() ===
                "ALLOW" && matches(rule)
    );

    return {
        allowed,
        deniedBy: allowed ? null : "ALLOW_LIST",
    };
}

/**
 * Called after Studio writes rules so the next command sees them instead of
 * waiting out the cache.
 */
function invalidateAccessRules(
    discordGuildId
) {
    if (discordGuildId) {
        cache.delete(discordGuildId);
    }
}

module.exports = {
    checkGuildAccess,
    getAccessRules,
    invalidateAccessRules,
};
