const {
    getPremiumStatus,
} = require("../src/services/entitlements/premiumStatusService");

const {
    SlashCommandBuilder,
} = require("discord.js");

const premium =
    require("../src/commands/premium/premium");

async function main() {
    const checks = [];

    function check(name, ok, detail) {
        checks.push({ name, ok, detail });
    }

    // 1. Command metadata
    check(
        "command name is premium",
        premium.data.name === "premium",
        premium.data.name
    );

    check(
        "command has a description",
        premium.data.description.length > 10,
        premium.data.description
    );

    const json = premium.data.toJSON();
    check(
        "serialises to Discord JSON",
        json.name === "premium" &&
            json.description.length > 0,
        JSON.stringify({
            name: json.name,
            type: json.type,
        })
    );

    check(
        "SlashCommandBuilder still works",
        new SlashCommandBuilder()
            .setName("x")
            .setDescription("y")
            .toJSON().name === "x",
        "ok"
    );

    // 2. Requires a discord id
    let threw = false;
    try {
        await getPremiumStatus(null);
    } catch {
        threw = true;
    }
    check(
        "throws without a discord id",
        threw,
        String(threw)
    );

    // 3. A user who does not exist reads as free/zero, not an error
    const ghost = await getPremiumStatus(
        "000000000000000000"
    );

    check(
        "unknown user is FREE",
        ghost.plan === "FREE",
        ghost.plan
    );

    check(
        "unknown user has zero crowns",
        ghost.crowns.balance === 0 &&
            ghost.crowns.earned === 0 &&
            ghost.crowns.spent === 0,
        JSON.stringify(ghost.crowns)
    );

    check(
        "unknown user has no unlocks",
        Array.isArray(ghost.unlocks) &&
            ghost.unlocks.length === 0,
        JSON.stringify(ghost.unlocks)
    );

    // 4. Real seeded users
    const { prisma } = require(
        "../src/services/database/prisma"
    );

    const users =
        await prisma.user.findMany({
            select: {
                discordId: true,
                username: true,
            },
            take: 5,
        });

    for (const user of users) {
        const status = await getPremiumStatus(
            user.discordId
        );

        check(
            `status for ${user.username}`,
            status.plan === "FREE" ||
                status.plan === "PREMIUM",
            `${status.plan} / ${status.crowns.balance}c / ` +
                `${status.unlocks.length} unlock(s)`
        );
    }

    // 5. A premium user, if any exists
    const premiumUser =
        await prisma.entitlement.findFirst({
            where: {
                type: "PREMIUM",
                active: true,
            },

            select: {
                user: {
                    select: {
                        discordId: true,
                        username: true,
                    },
                },
            },
        });

    if (premiumUser) {
        const status = await getPremiumStatus(
            premiumUser.user.discordId
        );

        check(
            "entitled user reads PREMIUM",
            status.plan === "PREMIUM",
            `${premiumUser.user.username}: ${status.plan}`
        );
    } else {
        console.log(
            "(no premium entitlement in this database)"
        );
    }

    // 6. A user with crowns
    const crownUser =
        await prisma.crownTransaction.findFirst({
            select: {
                user: {
                    select: {
                        discordId: true,
                        username: true,
                    },
                },
            },
        });

    if (crownUser) {
        const status = await getPremiumStatus(
            crownUser.user.discordId
        );

        check(
            "crown ledger reads a balance",
            Number.isFinite(status.crowns.balance),
            `${crownUser.user.username}: ` +
                JSON.stringify(status.crowns)
        );
    } else {
        console.log(
            "(no crown transactions in this database)"
        );
    }

    // 7. A user with unlocks
    const unlockUser =
        await prisma.crownUnlock.findFirst({
            where: {
                kind: "TIMED",
                expiresAt: { gt: new Date() },
            },

            select: {
                feature: true,
                expiresAt: true,
                user: {
                    select: {
                        discordId: true,
                        username: true,
                    },
                },
            },
        });

    if (unlockUser) {
        const status = await getPremiumStatus(
            unlockUser.user.discordId
        );

        const found = status.unlocks.find(
            (u) => u.feature === unlockUser.feature
        );

        check(
            "live unlock is reported",
            Boolean(found) &&
                Boolean(found.label) &&
                found.expiresAt instanceof Date,
            JSON.stringify(status.unlocks)
        );
    } else {
        console.log(
            "(no live timed unlocks in this database)"
        );
    }

    // 8. The command renders for both plans. Driving execute() with a
    //    fake interaction covers the wiring and the embed together.
    let embedOk = true;
    let embedDetail = "";

    for (const fake of [ghost, premiumUser
        ? {
            plan: "PREMIUM",
            crowns: {
                balance: 42,
                earned: 100,
                spent: 58,
            },
            unlocks: [
                {
                    feature: "PREMIUM_ASSETS",
                    label: "Premium Assets",
                    expiresAt: new Date(
                        Date.now() +
                        1000 * 60 * 60 * 50
                    ),
                },
            ],
        }
        : ghost]) {
        const captured = {};

        const interaction = {
            user: {
                id: fake === ghost
                    ? "000000000000000000"
                    : premiumUser.user.discordId,
            },

            deferReply: async () => {},

            editReply: async (payload) => {
                captured.payload = payload;
            },
        };

        await premium.execute(interaction);

        const embed =
            captured.payload?.embeds?.[0];

        if (!embed) {
            embedOk = false;
            embedDetail = "no embed";
            continue;
        }

        const data = embed.toJSON();
        const title = data.title ?? "";
        const fields = data.fields ?? [];

        const hasPlan = fields.some(
            (f) => f.name === "Plan"
        );
        const hasCrowns = fields.some(
            (f) => f.name === "Crowns"
        );

        if (!title || !hasPlan || !hasCrowns) {
            embedOk = false;
            embedDetail = JSON.stringify({
                title,
                fields: fields.map(
                    (f) => f.name
                ),
            });
        }
    }

    check(
        "command renders an embed for both plans",
        embedOk,
        embedDetail || "ok"
    );

    // 8. Crown ledger and unlock branches, against a fixture that is
    //    removed again. The dev database has no Crown data, so without
    //    this the balance arithmetic and the unlock de-duplication would
    //    never actually run.
    const fixtureDiscordId =
        "900000000000000001";

    const fixture =
        await prisma.user.create({
            data: {
                discordId: fixtureDiscordId,
                username: "crown_fixture",
                crownTransactions: {
                    create: [
                        {
                            type: "EARN",
                            amount: 100,
                            reason: "fixture",
                        },
                        {
                            type: "SPEND",
                            amount: -30,
                            reason: "fixture",
                        },
                        {
                            type: "REFUND",
                            amount: 5,
                            reason: "fixture",
                        },
                    ],
                },
                crownUnlocks: {
                    create: [
                        {
                            feature: "PREMIUM_ASSETS",
                            kind: "TIMED",
                            periodKey: "fixture",
                            expiresAt: new Date(
                                Date.now() +
                                1000 * 60 * 60 * 24
                            ),
                        },
                        {
                            feature: "PREMIUM_ASSETS",
                            kind: "TIMED",
                            periodKey: "fixture-2",
                            expiresAt: new Date(
                                Date.now() +
                                1000 * 60 * 60 * 72
                            ),
                        },
                        {
                            feature: "IMAGE_TO_AESTHETIC",
                            kind: "TIMED",
                            periodKey: "fixture",
                            expiresAt: new Date(
                                Date.now() -
                                1000 * 60 * 60
                            ),
                        },
                        {
                            feature: "AI_GENERATION_LIMIT",
                            kind: "BOOST",
                            periodKey: "fixture",
                            allowance: 10,
                        },
                    ],
                },
            },
        });

    try {
        const status = await getPremiumStatus(
            fixtureDiscordId
        );

        check(
            "balance is the sum of the ledger",
            status.crowns.balance === 75,
            JSON.stringify(status.crowns)
        );

        check(
            "earned counts positive rows",
            status.crowns.earned === 105,
            String(status.crowns.earned)
        );

        check(
            "spent is positive and counts negative rows",
            status.crowns.spent === 30,
            String(status.crowns.spent)
        );

        check(
            "expired unlocks are hidden",
            !status.unlocks.some(
                (u) =>
                    u.feature ===
                    "IMAGE_TO_AESTHETIC"
            ),
            JSON.stringify(
                status.unlocks.map(
                    (u) => u.feature
                )
            )
        );

        check(
            "boosts are hidden",
            !status.unlocks.some(
                (u) =>
                    u.feature ===
                    "AI_GENERATION_LIMIT"
            ),
            "ok"
        );

        check(
            "stacked unlocks collapse to the latest expiry",
            status.unlocks.length === 1 &&
                status.unlocks[0].feature ===
                    "PREMIUM_ASSETS" &&
                status.unlocks[0].label ===
                    "Premium Assets" &&
                status.unlocks[0].expiresAt >
                    new Date(
                        Date.now() +
                        1000 * 60 * 60 * 48
                    ),
            JSON.stringify(status.unlocks)
        );

        const captured = {};

        await premium.execute({
            user: {
                id: fixtureDiscordId,
                displayName: "Fixture User",
                displayAvatarURL: () =>
                    "https://cdn.discordapp.com/embed/avatars/0.png",
            },

            deferReply: async (options) => {
                captured.deferred = options;
            },

            editReply: async (payload) => {
                captured.payload = payload;
            },
        });

        const unlockField =
            (captured.payload?.embeds?.[0]?.toJSON()
                ?.fields ?? []).find(
                (f) =>
                    f.name ===
                    "Active Crown unlocks"
            );

        check(
            "embed lists the live unlock",
            Boolean(
                unlockField?.value?.includes(
                    "Premium Assets"
                )
            ),
            unlockField?.value ?? "missing"
        );

        // The reply is deliberately public so that one person checking
        // their status advertises Premium to the rest of the channel.
        check(
            "reply is public, not ephemeral",
            captured.deferred?.ephemeral === false,
            JSON.stringify(captured.deferred)
        );

        // A public reply has to name the user it belongs to.
        const author =
            captured.payload?.embeds?.[0]?.toJSON()
                ?.author;

        check(
            "embed attributes the status to the user",
            author?.name === "Fixture User",
            JSON.stringify(author) ?? "missing"
        );
    } finally {
        await prisma.user.delete({
            where: {
                id: fixture.id,
            },
        });
    }

    const failed =
        checks.filter((c) => !c.ok);

    for (const c of checks) {
        console.log(
            `${c.ok ? "PASS" : "FAIL"}  ${c.name}` +
                (c.detail ? `  [${c.detail}]` : "")
        );
    }

    console.log(
        `\n${checks.length - failed.length}/${checks.length} passed`
    );

    process.exit(
        failed.length > 0 ? 1 : 0
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
