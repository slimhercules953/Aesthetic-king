#!/usr/bin/env node
/**
 * Phase 2 verification for Server Studio access, appearance and analytics.
 *
 * Unlike the other scripts/ helpers this one needs no Discord connection — it
 * writes a throwaway guild straight to the database and asserts the behaviour
 * the bot depends on:
 *
 *   1. Access rules evaluate with deny precedence and allow-list semantics.
 *   2. Appearance falls back to bot defaults, and applying it restyles embeds,
 *      strips images and removes reroll buttons.
 *   3. Usage events are written for a known guild and ignored for an unknown
 *      one (so logging can never be the reason a command fails).
 *   4. The hand-written SQL the Studio libs issue runs against the real
 *      schema — the Studio has no Prisma client, so nothing else checks it.
 *
 * Everything it creates is deleted again, so it is safe to re-run.
 *
 * Usage: node scripts/testStudioPhase2.js
 */

require("dotenv").config();

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");

const { PrismaClient } = require("@prisma/client");

const {
    checkGuildAccess,
    invalidateAccessRules,
} = require("../src/services/database/guildAccessService");

const {
    DEFAULT_APPEARANCE,
    getGuildAppearance,
    invalidateGuildAppearance,
    applyGuildAppearance,
} = require("../src/services/database/guildAppearanceService");

const {
    recordUsageEvent,
} = require("../src/services/database/guildAnalyticsService");

const prisma = new PrismaClient();

const TEST_DISCORD_ID = "900000000000000001";

let passed = 0;
let failed = 0;

function check(label, condition, extra = "") {
    if (condition) {
        passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    } else {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`
        );
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

async function cleanup() {
    const guild = await prisma.guild.findUnique({
        where: { discordId: TEST_DISCORD_ID },
        select: { id: true },
    });

    if (!guild) {
        return;
    }

    await prisma.guildUsageEvent.deleteMany({
        where: { guildId: guild.id },
    });

    await prisma.guildAccessRule.deleteMany({
        where: { guildId: guild.id },
    });

    await prisma.guildSettings.deleteMany({
        where: { guildId: guild.id },
    });

    await prisma.guild.delete({
        where: { id: guild.id },
    });
}

async function addRule(guildId, rule) {
    await prisma.guildAccessRule.create({
        data: {
            guildId,
            ...rule,
        },
    });

    invalidateAccessRules(TEST_DISCORD_ID);
}

async function clearRules(guildId) {
    await prisma.guildAccessRule.deleteMany({
        where: { guildId },
    });

    invalidateAccessRules(TEST_DISCORD_ID);
}

async function testAccess(guildId) {
    section("Access rules");

    invalidateAccessRules(TEST_DISCORD_ID);

    const open = await checkGuildAccess({
        discordGuildId: TEST_DISCORD_ID,
        roleIds: [],
        channelId: "100",
    });

    check(
        "a guild with no rules is open",
        open.allowed === true,
        JSON.stringify(open)
    );

    await addRule(guildId, {
        kind: "CHANNEL",
        effect: "DENY",
        targetId: "999",
    });

    check(
        "a denied channel is blocked",
        (
            await checkGuildAccess({
                discordGuildId: TEST_DISCORD_ID,
                channelId: "999",
            })
        ).allowed === false
    );

    check(
        "other channels are unaffected",
        (
            await checkGuildAccess({
                discordGuildId: TEST_DISCORD_ID,
                channelId: "100",
            })
        ).allowed === true
    );

    await addRule(guildId, {
        kind: "ROLE",
        effect: "DENY",
        targetId: "555",
    });

    const roleDenial = await checkGuildAccess({
        discordGuildId: TEST_DISCORD_ID,
        roleIds: ["111", "555"],
        channelId: "100",
    });

    check(
        "a denied role is blocked",
        roleDenial.allowed === false,
        JSON.stringify(roleDenial)
    );

    check(
        "the denial names the offending rule kind",
        roleDenial.deniedBy === "ROLE",
        String(roleDenial.deniedBy)
    );

    await clearRules(guildId);

    await addRule(guildId, {
        kind: "ROLE",
        effect: "ALLOW",
        targetId: "555",
    });

    check(
        "an allow list admits a matching role",
        (
            await checkGuildAccess({
                discordGuildId: TEST_DISCORD_ID,
                roleIds: ["555"],
            })
        ).allowed === true
    );

    const excluded = await checkGuildAccess({
        discordGuildId: TEST_DISCORD_ID,
        roleIds: ["111"],
    });

    check(
        "an allow list excludes everyone else",
        excluded.allowed === false &&
            excluded.deniedBy === "ALLOW_LIST",
        JSON.stringify(excluded)
    );

    await addRule(guildId, {
        kind: "CHANNEL",
        effect: "DENY",
        targetId: "999",
    });

    check(
        "deny still wins inside the allow list",
        (
            await checkGuildAccess({
                discordGuildId: TEST_DISCORD_ID,
                roleIds: ["555"],
                channelId: "999",
            })
        ).allowed === false
    );

    await clearRules(guildId);
}

async function testAppearance(guildId) {
    section("Appearance");

    invalidateGuildAppearance(TEST_DISCORD_ID);

    const defaults = await getGuildAppearance(
        TEST_DISCORD_ID
    );

    check(
        "a guild with no settings keeps bot defaults",
        defaults.embedColor === DEFAULT_APPEARANCE.embedColor &&
            defaults.showGeneratedImages === true &&
            defaults.showRerollButtons === true,
        JSON.stringify(defaults)
    );

    await prisma.guildSettings.create({
        data: {
            guildId,
            embedColor: "#cc55ff",
            footerText: "Made for our community",
            showPackBadge: false,
            showGeneratedImages: false,
        },
    });

    invalidateGuildAppearance(TEST_DISCORD_ID);

    const custom = await getGuildAppearance(TEST_DISCORD_ID);

    check(
        "stored appearance is read back",
        custom.embedColor === "#cc55ff" &&
            custom.footerText === "Made for our community" &&
            custom.showPackBadge === false &&
            custom.showGeneratedImages === false &&
            custom.showRerollButtons === true,
        JSON.stringify(custom)
    );

    const embed = new EmbedBuilder()
        .setTitle("Neon Dream")
        .setColor(0x9b5cff)
        .setFooter({
            text: "Aesthetic King • Controls expire in 5 minutes",
        })
        .setImage("https://example.com/preview.png")
        .addFields({
            name: "Aesthetic Pack",
            value: "Vaporwave",
        });

    await applyGuildAppearance(
        TEST_DISCORD_ID,
        { embeds: [embed] }
    );

    const data = embed.data;

    check(
        "the embed colour is replaced",
        data.color === 0xcc55ff,
        String(data.color?.toString(16))
    );

    check(
        "the footer text is replaced",
        data.footer?.text === "Made for our community",
        String(data.footer?.text)
    );

    check(
        "the expiry notice survives a footer override",
        String(data.description ?? "").includes(
            "expire in 5 minutes"
        ),
        String(data.description)
    );

    check(
        "the pack badge is removed when disabled",
        (data.fields ?? []).every(
            (field) => field.name !== "Aesthetic Pack"
        ),
        JSON.stringify(data.fields)
    );

    check(
        "images are removed when disabled",
        data.image === undefined &&
            data.thumbnail === undefined,
        JSON.stringify({
            image: data.image,
            thumbnail: data.thumbnail,
        })
    );

    await prisma.guildSettings.update({
        where: { guildId },
        data: { showRerollButtons: false },
    });

    invalidateGuildAppearance(TEST_DISCORD_ID);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("aesthetic:reroll:abc")
            .setLabel("Reroll")
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId("aesthetic:save:abc")
            .setLabel("Save")
            .setStyle(ButtonStyle.Primary)
    );

    const noReroll = await applyGuildAppearance(
        TEST_DISCORD_ID,
        {
            embeds: [new EmbedBuilder().setTitle("Kept")],
            components: [row],
        }
    );

    check(
        "reroll buttons are removed when disabled",
        noReroll.components.length === 1 &&
            noReroll.components[0].components.length === 1 &&
            noReroll.components[0].components[0].data.custom_id ===
                "aesthetic:save:abc",
        JSON.stringify(
            noReroll.components.map((actionRow) =>
                actionRow.components.map(
                    (button) => button.data.custom_id
                )
            )
        )
    );

    const plain = await applyGuildAppearance(
        TEST_DISCORD_ID,
        { content: "plain text" }
    );

    check(
        "payloads without embeds pass through untouched",
        plain.content === "plain text"
    );

    /*
     * With every setting back at its default the service must not touch the
     * payload at all — that is what keeps the patch free for most servers.
     */
    await prisma.guildSettings.update({
        where: { guildId },
        data: {
            embedColor: null,
            footerText: null,
            showPackBadge: true,
            showGeneratedImages: true,
            showRerollButtons: true,
        },
    });

    invalidateGuildAppearance(TEST_DISCORD_ID);

    const untouched = { content: "hi" };

    check(
        "default settings return the identical payload",
        (await applyGuildAppearance(
            TEST_DISCORD_ID,
            untouched
        )) === untouched
    );

    await prisma.guildSettings.delete({
        where: { guildId },
    });

    invalidateGuildAppearance(TEST_DISCORD_ID);
}

async function testAnalytics(guildId) {
    section("Analytics");

    await recordUsageEvent({
        discordGuildId: TEST_DISCORD_ID,
        discordUserId: "42",
        commandName: "aesthetic",
        aestheticId: "aesthetic-1",
    });

    await recordUsageEvent({
        discordGuildId: TEST_DISCORD_ID,
        discordUserId: "42",
        commandName: "username",
    });

    // A reroll button press, as interactionCreate reports it.
    await recordUsageEvent({
        discordGuildId: TEST_DISCORD_ID,
        discordUserId: "77",
        commandName: "aesthetic",
        component: "button",
        aestheticId: "aesthetic-1",
    });

    const events = await prisma.guildUsageEvent.findMany({
        where: { guildId },
        orderBy: { createdAt: "asc" },
    });

    check(
        "usage events are written",
        events.length === 3,
        String(events.length)
    );

    check(
        "events keep the command and component",
        events.filter(
            (event) => event.commandName === "aesthetic"
        ).length === 2 &&
            events.some((event) => event.component === "button"),
        JSON.stringify(
            events.map((event) => [
                event.commandName,
                event.component,
            ])
        )
    );

    check(
        "the aesthetic id is captured for analytics",
        events.filter(
            (event) => event.aestheticId === "aesthetic-1"
        ).length === 2
    );

    /*
     * An unknown guild has no internal id, so the insert is skipped rather
     * than throwing — the property the bot's hot path relies on.
     */
    await recordUsageEvent({
        discordGuildId: "900000000000000002",
        discordUserId: "42",
        commandName: "aesthetic",
    });

    await recordUsageEvent({
        discordGuildId: TEST_DISCORD_ID,
    });

    check(
        "events for an unknown or incomplete context are dropped",
        (
            await prisma.guildUsageEvent.count({
                where: { guildId },
            })
        ) === 3,
        String(
            await prisma.guildUsageEvent.count({
                where: { guildId },
            })
        )
    );
}

/*
 * The Studio has no Prisma client — every statement is hand-written SQL, so
 * nothing type-checks it. These assertions run the exact shapes the Studio
 * libs issue, against the real schema.
 *
 * The GuildSettings upsert is the important one: `updatedAt` is Prisma's
 * @updatedAt, which is a client-side convention, so the column is NOT NULL
 * with no database default. Postgres checks NOT NULL when it builds the
 * candidate tuple — before ON CONFLICT runs — so an upsert that omits
 * `updatedAt` fails with 23502 even on the update branch.
 */
async function testStudioSql(guildId) {
    section("Studio SQL");

    const APPEARANCE_FIELDS = `
        "embedColor", "footerText", "showPackBadge",
        "showGeneratedImages", "showRerollButtons"`;

    /*
     * The Appearance section above created a settings row through Prisma.
     * Deleting it means the first upsert below really does take the insert
     * branch, which is where the missing `updatedAt` shows up.
     */
    await prisma.guildSettings.deleteMany({ where: { guildId } });

    const none = await prisma.$queryRawUnsafe(
        `SELECT ${APPEARANCE_FIELDS}
         FROM "GuildSettings" s
         INNER JOIN "Guild" g ON g.id = s."guildId"
         WHERE g."discordId" = $1 LIMIT 1`,
        TEST_DISCORD_ID
    );

    check(
        "the appearance read returns nothing without a settings row",
        none.length === 0
    );

    const inserted = await prisma.$queryRawUnsafe(
        `INSERT INTO "GuildSettings" (
             id, "guildId", "createdAt", "updatedAt",
             "embedColor", "showPackBadge"
         )
         SELECT gen_random_uuid()::text, g.id, NOW(), NOW(), $2, $3
         FROM "Guild" g WHERE g."discordId" = $1
         ON CONFLICT ("guildId") DO UPDATE SET
             "embedColor" = $2, "showPackBadge" = $3, "updatedAt" = NOW()
         RETURNING ${APPEARANCE_FIELDS}`,
        TEST_DISCORD_ID,
        "#7c5cff",
        false
    );

    check(
        "the appearance upsert inserts when no row exists",
        inserted.length === 1 &&
            inserted[0].embedColor === "#7c5cff" &&
            inserted[0].showPackBadge === false,
        JSON.stringify(inserted[0])
    );

    check(
        "columns left out of the insert keep their schema default",
        inserted[0].showRerollButtons === true &&
            inserted[0].showGeneratedImages === true,
        JSON.stringify(inserted[0])
    );

    const patched = await prisma.$queryRawUnsafe(
        `INSERT INTO "GuildSettings" (
             id, "guildId", "createdAt", "updatedAt", "footerText"
         )
         SELECT gen_random_uuid()::text, g.id, NOW(), NOW(), $2
         FROM "Guild" g WHERE g."discordId" = $1
         ON CONFLICT ("guildId") DO UPDATE SET
             "footerText" = $2, "updatedAt" = NOW()
         RETURNING ${APPEARANCE_FIELDS}`,
        TEST_DISCORD_ID,
        "Made by the king"
    );

    check(
        "the appearance upsert patches one column at a time",
        patched.length === 1 &&
            patched[0].footerText === "Made by the king",
        JSON.stringify(patched[0])
    );

    check(
        "patching one column preserves the others",
        patched[0].embedColor === "#7c5cff" &&
            patched[0].showPackBadge === false,
        JSON.stringify(patched[0])
    );

    const cleared = await prisma.$queryRawUnsafe(
        `INSERT INTO "GuildSettings" (
             id, "guildId", "createdAt", "updatedAt", "embedColor"
         )
         SELECT gen_random_uuid()::text, g.id, NOW(), NOW(), $2
         FROM "Guild" g WHERE g."discordId" = $1
         ON CONFLICT ("guildId") DO UPDATE SET
             "embedColor" = $2, "updatedAt" = NOW()
         RETURNING ${APPEARANCE_FIELDS}`,
        TEST_DISCORD_ID,
        null
    );

    check(
        "an explicit null clears a presentation column",
        cleared.length === 1 && cleared[0].embedColor === null,
        JSON.stringify(cleared[0])
    );

    /*
     * Deny beats allow, so the Studio lists DENY rules first. A plain
     * `ORDER BY effect` would sort ALLOW first and read as if the allow list
     * were checked first, which it is not.
     */
    const ruleSql = (kind, effect, targetId) =>
        prisma.$queryRawUnsafe(
            `INSERT INTO "GuildAccessRule" (
                 id, "guildId", kind, effect, "targetId",
                 "createdAt", "updatedAt"
             )
             SELECT gen_random_uuid()::text, g.id, $2, $3, $4, NOW(), NOW()
             FROM "Guild" g WHERE g."discordId" = $1
             ON CONFLICT ("guildId", "kind", "targetId") DO UPDATE SET
                 effect = EXCLUDED.effect, "updatedAt" = NOW()
             RETURNING id, kind, effect, "targetId"`,
            TEST_DISCORD_ID,
            kind,
            effect,
            targetId
        );

    await ruleSql("ROLE", "DENY", "111111111111111111");

    const flipped = await ruleSql(
        "ROLE",
        "ALLOW",
        "111111111111111111"
    );

    check(
        "re-adding a rule flips its effect instead of duplicating it",
        flipped.length === 1 &&
            flipped[0].effect === "ALLOW" &&
            (await prisma.guildAccessRule.count({
                where: { guildId },
            })) === 1,
        JSON.stringify(flipped[0])
    );

    await ruleSql("CHANNEL", "DENY", "222222222222222222");

    const ordered = await prisma.$queryRawUnsafe(
        `SELECT r.kind, r.effect, r."targetId"
         FROM "GuildAccessRule" r
         INNER JOIN "Guild" g ON g.id = r."guildId"
         WHERE g."discordId" = $1
         ORDER BY
             CASE r.effect WHEN 'DENY' THEN 0 ELSE 1 END ASC,
             r."createdAt" ASC`,
        TEST_DISCORD_ID
    );

    check(
        "the rule read lists DENY before ALLOW",
        ordered.length === 2 &&
            ordered[0].effect === "DENY" &&
            ordered[1].effect === "ALLOW",
        JSON.stringify(ordered.map((rule) => rule.effect))
    );

    const deleted = await prisma.$queryRawUnsafe(
        `DELETE FROM "GuildAccessRule" r
         USING "Guild" g
         WHERE g.id = r."guildId"
             AND g."discordId" = $1
             AND r.kind = $2
             AND r."targetId" = $3
         RETURNING r.id`,
        TEST_DISCORD_ID,
        "CHANNEL",
        "222222222222222222"
    );

    check(
        "a rule can be deleted through the guild join",
        deleted.length === 1,
        JSON.stringify(deleted)
    );

    /*
     * Analytics reads `discordUserId` / `commandName`, not the `userId` /
     * `command` the bot's service layer calls them, and the daily series is
     * generate_series-driven so a quiet day still renders.
     */
    const since = new Date(Date.now() - 30 * 864e5);

    const totals = await prisma.$queryRawUnsafe(
        `SELECT
             COUNT(*)::int AS total,
             COUNT(DISTINCT e."discordUserId")::int AS members,
             COUNT(*) FILTER (WHERE e."premium")::int AS premium,
             MIN(e."createdAt") AS "firstEventAt"
         FROM "GuildUsageEvent" e
         INNER JOIN "Guild" g ON g.id = e."guildId"
         WHERE g."discordId" = $1 AND e."createdAt" >= $2`,
        TEST_DISCORD_ID,
        since
    );

    check(
        "the analytics totals aggregate over the window",
        totals.length === 1 &&
            totals[0].total === 3 &&
            totals[0].members === 2 &&
            Number(totals[0].premium) === 0 &&
            totals[0].firstEventAt instanceof Date,
        JSON.stringify(totals[0])
    );

    const series = await prisma.$queryRawUnsafe(
        `SELECT to_char(day, 'YYYY-MM-DD') AS date,
                COALESCE(COUNT(e.id)::int, 0) AS count
         FROM generate_series(
             date_trunc('day', NOW()) - ($2::interval - '1 day')::interval,
             date_trunc('day', NOW()),
             '1 day'
         ) AS day
         LEFT JOIN "GuildUsageEvent" e
             ON date_trunc('day', e."createdAt") = day
             AND e."guildId" = (
                 SELECT id FROM "Guild" WHERE "discordId" = $1
             )
         GROUP BY day
         ORDER BY day ASC`,
        TEST_DISCORD_ID,
        "30 days"
    );

    check(
        "the daily series returns one point per day in the range",
        series.length === 30,
        `days=${series.length}`
    );

    check(
        "the daily series counts this guild's events",
        series[series.length - 1].count === 3,
        JSON.stringify(series[series.length - 1])
    );

    const byCommand = await prisma.$queryRawUnsafe(
        `SELECT e."commandName", COUNT(*)::int AS count
         FROM "GuildUsageEvent" e
         INNER JOIN "Guild" g ON g.id = e."guildId"
         WHERE g."discordId" = $1 AND e."createdAt" >= $2
         GROUP BY e."commandName"
         ORDER BY COUNT(*) DESC LIMIT 12`,
        TEST_DISCORD_ID,
        since
    );

    check(
        "the per-command breakdown groups by command name",
        byCommand.length === 2 &&
            byCommand[0].commandName === "aesthetic" &&
            byCommand[0].count === 2,
        JSON.stringify(byCommand)
    );
}

async function main() {
    await cleanup();

    const guild = await prisma.guild.create({
        data: {
            discordId: TEST_DISCORD_ID,
            name: "Studio Phase 2 Test Server",
        },
    });

    try {
        await testAccess(guild.id);
        await testAppearance(guild.id);
        await testAnalytics(guild.id);
        await testStudioSql(guild.id);
    } finally {
        await cleanup();
        invalidateAccessRules(TEST_DISCORD_ID);
        invalidateGuildAppearance(TEST_DISCORD_ID);
        await prisma.$disconnect();
    }

    console.log(
        `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
    );

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
