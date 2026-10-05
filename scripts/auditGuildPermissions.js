#!/usr/bin/env node

/*
 * Reports what the bot is actually allowed to do in every server it is in.
 *
 * Switching to a different Discord application means re-inviting, and a
 * re-invite carries whatever permission set the invite link asked for -- which
 * is not necessarily what the bot had before. Guessing which of ~300 servers
 * ended up short is not possible from the Discord UI, so this asks the API
 * directly and prints the servers that are missing something.
 *
 * It is read-only. Nothing here writes to Discord.
 *
 *   node scripts/auditGuildPermissions.js            # summary + problem guilds
 *   node scripts/auditGuildPermissions.js --json     # machine-readable dump
 *   node scripts/auditGuildPermissions.js --all      # list every guild, not just problems
 *
 * Requires TOKEN in .env. Uses only the Guilds intent's data, which the bot
 * already has, so no privileged intent is involved.
 */

const { REST, Routes, PermissionFlagsBits } = require("discord.js");

const config = require("../src/config/env");

/*
 * The set the invite link asks for, mirrored from studio/lib/botInvite.ts.
 * Kept as a literal rather than imported because that file is TypeScript
 * behind a Cloudflare `cloudflare:workers` import the bot cannot resolve.
 * If you change one, change the other.
 */
const INVITED_PERMISSIONS = {
    AddReactions: 64n,
    ViewChannel: 1024n,
    SendMessages: 2048n,
    EmbedLinks: 16384n,
    AttachFiles: 32768n,
    ReadMessageHistory: 65536n,
    UseExternalEmojis: 262144n,
    Connect: 1048576n,
    Speak: 2097152n,
    ChangeNickname: 67108864n,
    ManageRoles: 268435456n,
};

/*
 * The subset that silently breaks a feature when absent. Everything else only
 * affects one command in one channel, so a missing bit there is cosmetic.
 */
const FEATURE_CRITICAL = new Set(["ManageRoles"]);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const listAll = args.includes("--all");

const unknown = args.filter(
    (a) => a !== "--json" && a !== "--all"
);

if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(", ")}`);
    process.exit(1);
}

function bitName(bit) {
    const entry = Object.entries(INVITED_PERMISSIONS).find(
        ([, value]) => value === bit
    );
    return entry ? entry[0] : `bit:${bit}`;
}

/**
 * Resolves the bot's own permissions in one guild.
 *
 * /users/@me/guilds says the bot is present; it does not say what it may do
 * there. The per-guild member endpoint returns the role ids, and the guild's
 * role list turns those into an effective bitfield. Two requests per guild,
 * so ~600 for a 300-server bot.
 */
async function inspectGuild(rest, botId, guild) {
    /*
     * The members endpoint insists on a snowflake; "@me" is rejected with
     * "Value \"@me\" is not snowflake", so the bot's own id has to be fetched
     * once up front and passed down.
     */
    const member = await rest.get(Routes.guildMember(guild.id, botId));

    const roles = await rest.get(Routes.guildRoles(guild.id));

    const everyone = roles.find((role) => role.id === guild.id);
    const owned = new Set(member.roles);

    let allowed = BigInt(everyone ? everyone.permissions : "0");

    for (const role of roles) {
        if (owned.has(role.id)) {
            allowed |= BigInt(role.permissions);
        }
    }

    /*
     * ADMINISTRATOR overrides every check below, and a role carrying it makes
     * the individual bits irrelevant. Reported separately so the summary is
     * not full of "missing ManageRoles" notes for servers where the bot is
     * actually admin.
     */
    const administrator =
        (allowed & PermissionFlagsBits.Administrator) ===
        PermissionFlagsBits.Administrator;

    const missing = Object.values(INVITED_PERMISSIONS)
        .filter((bit) => (allowed & bit) !== bit)
        .map(bitName);

    /*
     * A bot can only manage roles below its own highest role, so ManageRoles
     * alone is not enough to make /color work -- the bot's top role has to sit
     * above the colour roles it creates. Newly created roles are hoisted to
     * just below the bot's highest, so this matters most where the bot's
     * highest role is near the bottom of the list.
     */
    const highest = roles
        .filter((role) => owned.has(role.id))
        .sort((a, b) => b.position - a.position)[0];

    /*
     * ADMINISTRATOR passes every permission check Discord makes, so reporting
     * missing bits alongside it is self-contradictory -- an admin bot is not
     * "missing ManageRoles", it simply never needed the explicit bit.
     */
    const effectiveMissing = administrator ? [] : missing;

    return {
        id: guild.id,
        name: guild.name,
        administrator,
        highestRole: highest ? highest.name : "@everyone",
        highestPosition: highest ? highest.position : 0,
        missing: effectiveMissing,
        featureCritical: effectiveMissing.some((name) =>
            FEATURE_CRITICAL.has(name)
        ),
    };
}

/*
 * `/users/@me/guilds` caps a response at 200 guilds, so a single `get` silently
 * reports only the first 200 for a bot in more servers than that. Walk `after=`
 * until a page comes back short.
 */
async function fetchAllGuilds(rest) {
    const guilds = [];
    let after = null;

    for (let page = 0; page < 50; page += 1) {
        const route = after
            ? `${Routes.userGuilds()}?limit=200&after=${after}`
            : `${Routes.userGuilds()}?limit=200`;

        const batch = await rest.get(route);

        guilds.push(...batch);

        if (batch.length < 200) {
            return guilds;
        }

        after = batch[batch.length - 1] ? batch[batch.length - 1].id : null;

        if (!after) {
            return guilds;
        }
    }

    return guilds;
}

async function main() {
    const rest = new REST({ version: "10" }).setToken(
        config.discord.token
    );

    const guilds = await fetchAllGuilds(rest);

    /*
     * Taken from the token rather than CLIENT_ID on purpose: if the two ever
     * disagree (a stale .env after a bot swap, which is exactly the situation
     * this script exists for) the audit still describes the bot the token
     * belongs to, which is the one whose permissions are in question.
     */
    const me = await rest.get(Routes.user());

    if (!asJson) {
        console.log(
            `${me.username} (${me.id}) is in ${guilds.length} server(s). Checking permissions...`
        );
    }

    const results = [];

    /*
     * Deliberately serial. Discord's rate limits are per-route, and firing
     * 600 requests concurrently trades a 30-second audit for a 429 wall.
     */
    for (const [index, guild] of guilds.entries()) {
        try {
            const result = await inspectGuild(rest, me.id, guild);
            results.push(result);
        } catch (error) {
            results.push({
                id: guild.id,
                name: guild.name,
                error: `${error.status || ""} ${error.message}`.trim(),
                missing: [],
                featureCritical: false,
            });
        }

        if (!asJson && (index + 1) % 25 === 0) {
            console.log(`  checked ${index + 1}/${guilds.length}`);
        }
    }

    const broken = results.filter((r) => r.error);
    const critical = results.filter((r) => r.featureCritical);
    const cosmetic = results.filter(
        (r) => !r.error && !r.featureCritical && r.missing.length > 0
    );
    const admins = results.filter((r) => !r.error && r.administrator);
    const clean = results.filter(
        (r) => !r.error && !r.administrator && r.missing.length === 0
    );

    if (asJson) {
        console.log(JSON.stringify(results, null, 2));
        return;
    }

    console.log("");
    console.log("=== summary ===");
    console.log(`  fully permitted .............. ${clean.length}`);
    console.log(`  administrator ................ ${admins.length}`);
    console.log(
        `  missing a feature-critical bit ${critical.length}`
    );
    console.log(
        `  missing only cosmetic bits ..... ${cosmetic.length}`
    );
    console.log(`  could not be inspected ....... ${broken.length}`);

    const report = (title, rows) => {
        if (rows.length === 0) {
            return;
        }
        console.log("");
        console.log(`=== ${title} ===`);
        for (const row of rows) {
            let detail;
            if (row.error) {
                detail = row.error;
            } else if (row.missing.length === 0) {
                detail = `no gaps (highest role: ${row.highestRole})` +
                    (row.administrator ? ", ADMINISTRATOR" : "");
            } else {
                detail = `${row.missing.join(", ")} (highest role: ${row.highestRole})`;
            }
            console.log(`  ${row.name} (${row.id})\n      ${detail}`);
        }
    };

    report("needs attention", critical);
    report("minor gaps", cosmetic);
    report("could not inspect", broken);

    if (listAll) {
        report("all servers", results);
    }

    console.log("");
    console.log(
        critical.length === 0
            ? "No server is missing a feature-critical permission."
            : `${critical.length} server(s) need the bot re-invited or the role edited.`
    );

    /*
     * Non-zero exit only for inspection failures, not for missing permissions:
     * a server whose owner stripped a bit is a real state to discover, not a
     * broken audit run.
     */
    process.exit(broken.length > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error(
        `Audit failed: ${error.message}` +
            (error.status ? ` (HTTP ${error.status})` : "")
    );
    process.exit(1);
});
