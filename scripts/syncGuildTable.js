/**
 * Fills the "Guild" table from Discord's REST API instead of a gateway
 * connection.
 *
 * The Studio's "Installed" badge is a lookup against "Guild", and the only
 * things that normally write that table are the bot's `ready`, `guildCreate`
 * and `guildDelete` handlers. That is a problem when the site is live but the
 * bot is not running yet — every server reads "Not Installed" even though the
 * bot is in it.
 *
 * This script asks Discord for the same list the gateway would have handed the
 * bot, using only the bot token, so the badge can be correct without a running
 * bot. It is a snapshot: servers added or removed after this run are not
 * reflected until the bot's real handlers update them.
 *
 * `/users/@me/guilds` returns at most 200 guilds per page, so this pages with
 * `after=` until Discord returns a short page. A bot in more than 200 servers
 * would otherwise be recorded as being in only the first 200.
 *
 * Rows are upserted, and by default nothing is deleted. Pass --prune to also
 * remove rows for servers the bot has left, which is what the bot's own
 * `syncGuildsFromDiscord()` does. Pruning is opt-in because running this
 * script with the wrong token would otherwise wipe a correct table and
 * replace it with a different application's servers.
 *
 * Usage:
 *   node scripts/syncGuildTable.js            # preview
 *   node scripts/syncGuildTable.js --apply    # write
 *   node scripts/syncGuildTable.js --apply --prune
 */

const {
    REST,
    Routes,
} = require("discord.js");

const config =
    require("../src/config/env");

const logger =
    require("../src/utils/logger");

const {
    prisma,
    connectDatabase,
    disconnectDatabase,
} = require("../src/services/database/prisma");

const apply = process.argv.includes("--apply");
const prune = process.argv.includes("--prune");

const PAGE_SIZE = 200;

/**
 * Every guild the bot is in, following Discord's cursor.
 *
 * A bot token authenticates as the bot, so this endpoint returns the guilds
 * the bot has joined rather than the guilds of a human account.
 */
async function fetchAllBotGuilds(rest) {
    const guilds = [];
    let after = null;

    for (let page = 1; page <= 50; page += 1) {
        const route = after
            ? `${Routes.userGuilds()}?limit=${PAGE_SIZE}&after=${after}`
            : `${Routes.userGuilds()}?limit=${PAGE_SIZE}`;

        const batch = await rest.get(route);

        if (!Array.isArray(batch) || batch.length === 0) {
            break;
        }

        guilds.push(...batch);

        if (batch.length < PAGE_SIZE) {
            break;
        }

        after = batch[batch.length - 1].id;

        logger.info(`Fetched ${guilds.length} guild(s) so far...`);
    }

    return guilds;
}

async function main() {
    await connectDatabase();

    const rest = new REST({ version: "10" }).setToken(
        config.discord.token,
    );

    const me = await rest.get(Routes.user("@me"));

    logger.info(
        `Authenticated as ${me.username} (application ${me.id}).`,
    );

    if (String(me.id) !== String(config.discord.clientId)) {
        logger.warn(
            `TOKEN belongs to application ${me.id} but CLIENT_ID is ` +
            `${config.discord.clientId}. These must be the same ` +
            "application — the guilds written here would not match the " +
            "invite links the Studio generates. Fix the .env and re-run.",
        );
    }

    const guilds = await fetchAllBotGuilds(rest);

    logger.info(
        `Bot is in ${guilds.length} guild(s): ` +
        guilds
            .slice(0, 5)
            .map((guild) => guild.name)
            .join(", ") +
        (guilds.length > 5 ? ", ..." : ""),
    );

    const existing = await prisma.guild.findMany({
        select: { discordId: true, name: true, iconHash: true },
    });

    const existingById = new Map(
        existing.map((row) => [row.discordId, row]),
    );

    const incoming = guilds.map((guild) => ({
        discordId: guild.id,
        name: guild.name || null,
        iconHash: guild.icon || null,
    }));

    const toCreate = incoming.filter(
        (row) => !existingById.has(row.discordId),
    );
    const toUpdate = incoming.filter((row) => {
        const current = existingById.get(row.discordId);
        return (
            current &&
            (current.name !== row.name ||
                current.iconHash !== row.iconHash)
        );
    });

    const incomingIds = new Set(
        incoming.map((row) => row.discordId),
    );
    const stale = existing.filter(
        (row) => !incomingIds.has(row.discordId),
    );

    logger.info(
        `${incoming.length} guild(s) known to Discord: ` +
        `${toCreate.length} new, ${toUpdate.length} to refresh, ` +
        `${incoming.length - toCreate.length - toUpdate.length} unchanged.`,
    );

    if (stale.length > 0) {
        logger.warn(
            `${stale.length} row(s) in the database are not in Discord's ` +
            `list${prune ? " and will be removed" : " (left alone; pass --prune to remove)"}.`,
        );
    }

    if (!apply) {
        logger.warn(
            "Dry run — nothing was written. Re-run with --apply to write.",
        );
        return;
    }

    for (const row of incoming) {
        await prisma.guild.upsert({
            where: { discordId: row.discordId },
            update: { name: row.name, iconHash: row.iconHash },
            create: row,
        });
    }

    if (prune && stale.length > 0) {
        await prisma.guild.deleteMany({
            where: { discordId: { in: stale.map((row) => row.discordId) } },
        });
    }

    const total = await prisma.guild.count();

    logger.success(
        `Wrote ${incoming.length} guild(s); "Guild" now holds ${total} row(s)` +
        (prune ? " (pruned)" : "") +
        ". The Studio caches the badge lookup briefly, so give it a minute.",
    );
}

main()
    .catch((error) => {
        logger.error("Failed to synchronize the guild table.", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDatabase();
    });
