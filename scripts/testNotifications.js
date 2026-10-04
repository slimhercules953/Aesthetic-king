#!/usr/bin/env node
/**
 * Verification for the Phase 8 notifications surface:
 * `studio/lib/notifications.ts`, the `/api/notifications` route, the
 * full-page list, and the nav entries that make the page reachable.
 *
 * The bell is the only place a user learns that someone liked or remixed
 * their work, and the whole feature is hand-written SQL addressed by a
 * Discord id taken from a session cookie. Two failure modes matter:
 *
 *   1. Ownership. Every statement must scope through `User.discordId`; a
 *      notification id on its own proves nothing about who may read, mark
 *      or delete it.
 *   2. Never breaking the caller. `createNotification` runs inline inside
 *      a like/remix request, so it has to swallow its own failures.
 *
 * The list is also a *merge* — stored rows plus two kinds synthesised at
 * read time (Premium-expiry warnings, undismissed patch notes) — so the
 * page has to render that merged shape rather than query `Notification`
 * itself. That contract is asserted against the page source.
 *
 * Usage: node scripts/testNotifications.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const esbuild = require(path.join(
    ROOT,
    "studio",
    "node_modules",
    "esbuild"
));

const NOTIFICATIONS_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "notifications.ts"
);

const ROUTE_PATH = path.join(
    ROOT,
    "studio",
    "app",
    "api",
    "notifications",
    "route.ts"
);

const PAGE_PATH = path.join(
    ROOT,
    "studio",
    "app",
    "dashboard",
    "notifications",
    "page.tsx"
);

const LIST_PATH = path.join(
    ROOT,
    "studio",
    "components",
    "dashboard",
    "NotificationsList.tsx"
);

const BELL_PATH = path.join(
    ROOT,
    "studio",
    "components",
    "dashboard",
    "NotificationBell.tsx"
);

const SIDEBAR_PATH = path.join(
    ROOT,
    "studio",
    "components",
    "dashboard",
    "Sidebar.tsx"
);

const TOPBAR_PATH = path.join(
    ROOT,
    "studio",
    "components",
    "dashboard",
    "Topbar.tsx"
);

const SCHEMA_PATH = path.join(
    ROOT,
    "prisma",
    "schema.prisma"
);

const MIGRATION_DIR = path.join(
    ROOT,
    "prisma",
    "migrations"
);

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

function readSource(file) {
    return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Compiles a Studio module to CommonJS and evaluates it. `stubs` maps a
 * bare specifier to a fake export; relative specifiers resolve to sibling
 * `.ts` files and load the same way.
 */
function loadModule(modulePath, stubRequire = {}) {
    const stubs = {
        "next/server": {
            NextResponse: {
                json: () => ({}),
            },
        },
        ...stubRequire,
    };

    const result = esbuild.transformSync(
        fs.readFileSync(modulePath, "utf8"),
        {
            loader: "ts",
            format: "cjs",
            target: "node20",
        }
    );

    const module = { exports: {} };

    const req = (specifier) => {
        if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
            return stubs[specifier];
        }

        if (specifier.startsWith(".")) {
            const base = path.resolve(
                path.dirname(modulePath),
                specifier
            );

            for (const candidate of [
                `${base}.ts`,
                `${base}.tsx`,
                path.join(base, "index.ts"),
            ]) {
                if (fs.existsSync(candidate)) {
                    return loadModule(candidate, stubs);
                }
            }
        }

        throw new Error(
            `testNotifications: cannot resolve "${specifier}" ` +
            `from ${modulePath}`
        );
    };

    new Function("module", "exports", "require", result.code)(
        module,
        module.exports,
        req
    );

    return module.exports;
}

/**
 * A fake `./database` export. Handlers are matched by a substring of the
 * statement so a test can decide what a given query returns and how many
 * rows it affected; unmatched statements return nothing.
 */
function fakeDb() {
    const calls = [];
    const handlers = [];

    return {
        calls,
        on(match, factory) {
            handlers.push({ match, factory });
        },
        query: async (text, params = []) => {
            calls.push({ text, params });

            for (const handler of handlers) {
                if (text.includes(handler.match)) {
                    const out = handler.factory(params) ?? {};
                    return {
                        rows: out.rows ?? [],
                        rowCount:
                            out.rowCount ??
                            (out.rows ?? []).length,
                    };
                }
            }

            return { rows: [], rowCount: 0 };
        },
    };
}

function offline() {
    section("createNotification — the write must never break a like");

    return (async () => {
        const db = fakeDb();

        db.on('INSERT INTO "Notification"', () => ({
            rows: [{ id: "note-1" }],
        }));

        const mod = loadModule(NOTIFICATIONS_PATH, {
            "./database": db,
        });

        const created = await mod.createNotification({
            userId: "user-1",
            type: "LIKE",
            title: "  Someone liked your profile  ",
            body: "  ",
            href: "/u/123456789012345678",
            icon: "Heart",
            dedupeKey: "like:post-1:liker-1",
        });

        const insert = db.calls[0];

        check(
            "a new row is reported as created",
            created === true
        );

        check(
            "the insert targets Notification only",
            /INSERT INTO "Notification"/.test(insert.text) &&
                !/UPDATE|DELETE/.test(insert.text)
        );

        check(
            "the type is a bound parameter cast to the enum",
            insert.params[1] === "LIKE" &&
                /\$2::"NotificationType"/.test(insert.text)
        );

        check(
            "the title is trimmed before storing",
            insert.params[2] === "Someone liked your profile"
        );

        check(
            "a blank body is stored as null, not \"\"",
            insert.params[3] === null
        );

        check(
            "the dedupe key is bound",
            insert.params[6] === "like:post-1:liker-1" &&
                !insert.text.includes("like:post-1:liker-1")
        );

        check(
            "a replayed event is a no-op, not a second notice",
            /ON CONFLICT \("dedupeKey"\) DO NOTHING/.test(
                insert.text
            )
        );

        db.calls.length = 0;

        const blank = await mod.createNotification({
            userId: "user-1",
            type: "LIKE",
            title: "   ",
        });

        check(
            "a blank title short-circuits before any query",
            blank === false && db.calls.length === 0
        );

        /*
         * The whole point of the try/catch: a database that is down must
         * cost the user a bell icon, not their like.
         */
        const throwing = loadModule(NOTIFICATIONS_PATH, {
            "./database": {
                query: async () => {
                    throw new Error("connection terminated");
                },
            },
        });

        const logged = [];
        const realError = console.error;
        console.error = (...args) => logged.push(args.join(" "));

        let threw = false;
        let result;

        try {
            result = await throwing.createNotification({
                userId: "user-1",
                type: "LIKE",
                title: "Someone liked your profile",
            });
        } catch {
            threw = true;
        } finally {
            console.error = realError;
        }

        check(
            "a database failure does not propagate to the caller",
            !threw && result === false,
            threw ? "threw" : String(result)
        );

        check(
            "the failure is still logged",
            logged.some((line) =>
                line.includes("[notifications]")
            ),
            JSON.stringify(logged)
        );

        section("createNotificationForDiscordUser — addressed by Discord id");

        const byDiscord = fakeDb();

        const discordMod = loadModule(
            NOTIFICATIONS_PATH,
            {
                "./database": byDiscord,
            }
        );

        const missing =
            await discordMod.createNotificationForDiscordUser(
                "   ",
                {
                    type: "LIKE",
                    title: "Someone liked your profile",
                }
            );

        check(
            "a blank Discord id short-circuits",
            missing === false && byDiscord.calls.length === 0
        );

        const unknown =
            await discordMod.createNotificationForDiscordUser(
                "123456789012345678",
                {
                    type: "LIKE",
                    title: "Someone liked your profile",
                }
            );

        check(
            "an unknown user gets no notice and no insert",
            unknown === false &&
                byDiscord.calls.length === 1 &&
                /FROM "User"/.test(byDiscord.calls[0].text)
        );

        const found = fakeDb();
        found.on('FROM "User"', () => ({
            rows: [{ id: "user-9" }],
        }));

        const foundMod = loadModule(NOTIFICATIONS_PATH, {
            "./database": found,
        });

        await foundMod.createNotificationForDiscordUser(
            "123456789012345678",
            {
                type: "REMIX",
                title: "Someone remixed your aesthetic",
            }
        );

        const lookup = found.calls[0];
        const insert2 = found.calls[1];

        check(
            "the internal user id from the lookup is used for the insert",
            insert2 && insert2.params[0] === "user-9",
            JSON.stringify(insert2?.params?.[0])
        );

        check(
            "the Discord id is bound in the lookup",
            lookup.params[0] === "123456789012345678" &&
                !lookup.text.includes("123456789012345678")
        );

        section("listNotifications — the merged list");

        const listDb = fakeDb();

        listDb.on('FROM "Notification" n', () => ({
            rows: [
                {
                    id: "row-1",
                    type: "LIKE",
                    title: "Newest stored",
                    body: null,
                    href: null,
                    icon: null,
                    readAt: null,
                    createdAt: new Date("2026-10-05T10:00:00Z"),
                },
                {
                    id: "row-2",
                    type: "REMIX",
                    title: "Older stored",
                    body: "b",
                    href: "/u/1",
                    icon: "Sparkles",
                    readAt: new Date("2026-10-04T00:00:00Z"),
                    createdAt: new Date("2026-10-03T10:00:00Z"),
                },
            ],
        }));

        listDb.on('FROM "PatchNote" p', () => ({
            rows: [
                {
                    id: "patch-1",
                    version: "v2.3",
                    title: "Discover",
                    body: "New feed.",
                    publishedAt: new Date("2026-10-05T12:00:00Z"),
                },
            ],
        }));

        listDb.on('FROM "Entitlement" e', () => ({
            rows: [
                {
                    endsAt: new Date(
                        Date.now() + 3 * 24 * 60 * 60 * 1000
                    ),
                },
            ],
        }));

        const listMod = loadModule(NOTIFICATIONS_PATH, {
            "./database": listDb,
        });

        const items =
            await listMod.listNotifications(
                "123456789012345678"
            );

        const storedCall = listDb.calls.find((c) =>
            c.text.includes('FROM "Notification" n')
        );

        check(
            "stored notices are scoped through the owner's Discord id",
            storedCall &&
                /INNER JOIN "User" u/.test(storedCall.text) &&
                /u\."discordId" = \$1/.test(storedCall.text) &&
                storedCall.params[0] === "123456789012345678"
        );

        check(
            "the list is capped so one busy account cannot blow up the bell",
            storedCall &&
                /LIMIT \d+/.test(storedCall.text) &&
                !storedCall.text.includes("LIMIT $"),
            storedCall?.text.match(/LIMIT [^\n]*/)?.[0]
        );

        check(
            "patch notes become notices with a namespaced id",
            items.some(
                (item) =>
                    item.id === "patch:patch-1" &&
                    item.type === "BOT_UPDATE" &&
                    item.title.includes("v2.3")
            ),
            JSON.stringify(items.map((i) => i.id))
        );

        check(
            "an expiring entitlement produces a Premium warning",
            items.some(
                (item) =>
                    item.id.startsWith("expiry:") &&
                    item.type === "PREMIUM_EXPIRING" &&
                    /ends in 3 days/.test(item.title)
            ),
            JSON.stringify(items.map((i) => i.title))
        );

        check(
            "the merged list is sorted newest first",
            items.every(
                (item, index) =>
                    index === 0 ||
                    items[index - 1].createdAt.getTime() >=
                        item.createdAt.getTime()
            ),
            JSON.stringify(items.map((i) => i.createdAt))
        );

        check(
            "the expiry warning links to billing",
            items
                .find((i) => i.id.startsWith("expiry:"))
                ?.href === "/dashboard/premium/billing"
        );

        section("countUnread");

        const countDb = fakeDb();
        countDb.on('COUNT', () => ({
            rows: [{ count: "4" }],
        }));

        const countMod = loadModule(NOTIFICATIONS_PATH, {
            "./database": countDb,
        });

        const count = await countMod.countUnread(
            "123456789012345678"
        );

        const countCall = countDb.calls[0];

        check(
            "the unread count is a number",
            count === 4,
            JSON.stringify(count)
        );

        check(
            "the unread count only counts unread rows",
            /"readAt" IS NULL/.test(countCall.text)
        );

        check(
            "the unread count is owner-scoped",
            /u\."discordId" = \$1/.test(countCall.text) &&
                countCall.params[0] === "123456789012345678"
        );

        section("mark read / delete — synthetic ids");

        /*
         * The list is a merge, so some ids are not rows. `patch:` ids are
         * dismissed by writing to PatchNotification; `expiry:` ids are a
         * derived fact with nothing to write. Both must be handled without
         * ever sending a synthetic string into a Notification statement,
         * where it would simply match nothing and silently lie about it.
         */
        const markDb = fakeDb();
        markDb.on('INSERT INTO "PatchNotification"', () => ({
            rowCount: 1,
        }));
        markDb.on('UPDATE "Notification" n', () => ({
            rowCount: 1,
        }));

        const markMod = loadModule(NOTIFICATIONS_PATH, {
            "./database": markDb,
        });

        await markMod.markNotificationRead(
            "patch:patch-1",
            "123456789012345678"
        );

        const patchCall = markDb.calls[0];

        check(
            "marking a patch note read dismisses it once, not by deleting",
            /INSERT INTO "PatchNotification"/.test(
                patchCall.text
            ) &&
                /ON CONFLICT \("userId", "patchId"\) DO NOTHING/.test(
                    patchCall.text
                ) &&
                markDb.calls.length === 1
        );

        check(
            "the dismissal is scoped to the owner",
            /u\."discordId" = \$1/.test(patchCall.text) &&
                patchCall.params[0] === "123456789012345678"
        );

        markDb.calls.length = 0;

        const expiryResult =
            await markMod.markNotificationRead(
                "expiry:2026-10-08T00:00:00.000Z",
                "123456789012345678"
            );

        check(
            "the derived expiry warning is reported handled with no query",
            expiryResult === true && markDb.calls.length === 0
        );

        markDb.calls.length = 0;

        await markMod.markNotificationRead(
            "row-1",
            "123456789012345678"
        );

        const updateCall = markDb.calls[0];

        check(
            "marking a stored row read is owner-scoped",
            /UPDATE "Notification" n/.test(updateCall.text) &&
                /u\."discordId" = \$2/.test(updateCall.text) &&
                /n\.id = \$1/.test(updateCall.text) &&
                updateCall.params[1] === "123456789012345678"
        );

        check(
            "the update is guarded by readAt IS NULL so it is idempotent",
            /n\."readAt" IS NULL/.test(updateCall.text)
        );

        markDb.calls.length = 0;

        await markMod.deleteNotification(
            "patch:patch-2",
            "123456789012345678"
        );

        check(
            "deleting a patch note dismisses rather than deletes",
            /INSERT INTO "PatchNotification"/.test(
                markDb.calls[0].text
            ) &&
                !markDb.calls.some((c) =>
                    /DELETE FROM "Notification"/.test(c.text)
                )
        );

        markDb.calls.length = 0;

        await markMod.deleteNotification(
            "row-9",
            "123456789012345678"
        );

        const deleteCall = markDb.calls[0];

        check(
            "deleting a stored row is owner-scoped",
            /DELETE FROM "Notification" n/.test(
                deleteCall.text
            ) &&
                /u\."discordId" = \$2/.test(deleteCall.text) &&
                deleteCall.params[1] === "123456789012345678"
        );

        markDb.calls.length = 0;

        const all = await markMod.markAllNotificationsRead(
            "123456789012345678"
        );

        check(
            "mark-all clears stored rows and dismisses patch notes",
            markDb.calls.some((c) =>
                /UPDATE "Notification" n/.test(c.text)
            ) &&
                markDb.calls.some((c) =>
                    /INSERT INTO "PatchNotification"/.test(c.text)
            ) &&
                typeof all === "number",
            JSON.stringify(
                markDb.calls.map((c) => c.text.slice(0, 30))
            )
        );

        check(
            "mark-all never touches the derived expiry warning",
            !markDb.calls.some((c) =>
                /FROM "Entitlement"/.test(c.text)
            )
        );

        section("the API route");

        const routeSource = readSource(ROUTE_PATH);

        for (const verb of [
            "export async function GET",
            "export async function PATCH",
            "export async function DELETE",
        ]) {
            check(
                `${verb} exists`,
                routeSource.includes(verb)
            );
        }

        check(
            "every verb authenticates before touching data",
            (
                routeSource.match(
                    /await authenticate\(request\)/g
                ) ?? []
            ).length >= 3
        );

        check(
            "every handler identifies the owner from the session, never the body",
            [
                "listNotifications",
                "countUnread",
                "markNotificationRead",
                "markAllNotificationsRead",
                "deleteNotification",
            ].every((fn) =>
                new RegExp(
                    `${fn}\\(\\s*[^)]*session\\.discordId`
                ).test(routeSource)
            ),
            "a body- or query-supplied id must never be used to pick an owner"
        );

        check(
            "the notification id from the client is only ever a subject",
            /String\(payload\.id \?\? ""\)\.trim\(\)/.test(
                routeSource
            ) &&
                /searchParams\.get\("id"\)/.test(routeSource)
        );

        check(
            "a missing session is a 401 rather than an empty list",
            /status:\s*401/.test(routeSource)
        );

        section("the page and its navigation");

        const pageSource = readSource(PAGE_PATH);

        check(
            "the page renders the merged list, not a direct table query",
            /listNotifications\(/.test(pageSource) &&
                !/FROM "Notification"/.test(pageSource)
        );

        check(
            "the page reads the unread count server-side",
            /countUnread\(/.test(pageSource)
        );

        check(
            "the page is behind the session check",
            /verifySessionToken\(/.test(pageSource) &&
                /SESSION_COOKIE_NAME/.test(pageSource)
        );

        check(
            "the page reads the list for the session's own account",
            /listNotifications\(session\.discordId\)/.test(
                pageSource
            ) &&
                /countUnread\(session\.discordId\)/.test(
                    pageSource
                )
        );

        check(
            "the page has metadata",
            /export const metadata/.test(pageSource) &&
                /dashboardMetadata\(/.test(pageSource)
        );

        const listSource = readSource(LIST_PATH);

        check(
            "the list component is a client component",
            listSource.startsWith('"use client"')
        );

        check(
            "the list talks to the same route as the bell",
            /fetch\(\s*"\/api\/notifications"/.test(listSource) &&
                /method:\s*"PATCH"/.test(listSource) &&
                /method:\s*"DELETE"/.test(listSource)
        );

        check(
            "the derived expiry row is not offered a fake mark-read",
            /isDismissable/.test(listSource) &&
                /!id\.includes\(":"\)\s*\|\|\s*id\.startsWith\("patch:"\)/.test(
                    listSource
                )
        );

        check(
            "marking read is optimistic but still persisted",
            /setItems\(\(current\) =>/.test(listSource) &&
                /await fetch\(/.test(listSource)
        );

        const bellSource = readSource(BELL_PATH);

        check(
            "the bell links to the full page",
            /href="\/dashboard\/notifications"/.test(bellSource)
        );

        for (const [label, source] of [
            ["the sidebar", readSource(SIDEBAR_PATH)],
            ["the mobile menu", readSource(TOPBAR_PATH)],
        ]) {
            check(
                `${label} links to the notifications page`,
                /"\/dashboard\/notifications"/.test(source)
            );
        }

        section("PROFILE_UPDATED is gone, not merely unused");

        const schemaSource = readSource(SCHEMA_PATH);

        const enumBlock =
            schemaSource.match(
                /enum NotificationType \{([\s\S]*?)\n\}/
            )?.[1] ?? "";

        check(
            "the Prisma enum no longer declares PROFILE_UPDATED",
            enumBlock !== "" &&
                !/PROFILE_UPDATED/.test(enumBlock),
            enumBlock.trim().slice(0, 80)
        );

        check(
            "the TypeScript union no longer declares it",
            !/PROFILE_UPDATED/.test(
                readSource(NOTIFICATIONS_PATH)
            )
        );

        check(
            "no shipped source references it",
            !/PROFILE_UPDATED/.test(
                [
                    readSource(ROUTE_PATH),
                    readSource(PAGE_PATH),
                    readSource(LIST_PATH),
                    readSource(BELL_PATH),
                ].join("\n")
            )
        );

        const migrations = fs
            .readdirSync(MIGRATION_DIR)
            .filter((name) =>
                fs.existsSync(
                    path.join(MIGRATION_DIR, name, "migration.sql")
                )
            )
            .sort();

        const drop = migrations.find((name) =>
            name.includes("drop_profile_updated")
        );

        check(
            "a migration drops the enum value",
            Boolean(drop),
            migrations.join(", ")
        );

        if (drop) {
            const sql = readSource(
                path.join(MIGRATION_DIR, drop, "migration.sql")
            );

            check(
                "the migration rebuilds the enum rather than pretending",
                /ALTER TYPE "public"\."NotificationType" RENAME TO/.test(
                    sql
                ) &&
                    /CREATE TYPE "public"\."NotificationType" AS ENUM/.test(
                        sql
                    ) &&
                    /DROP TYPE "public"\."NotificationType_old"/.test(
                        sql
                )
            );

            check(
                "the recreated enum keeps every value that had an emitter",
                /CREATE TYPE[\s\S]*?'LIKE'/.test(sql) &&
                    /'PREMIUM_GRANTED'/.test(sql) &&
                    /'PREMIUM_REVOKED'/.test(sql) &&
                    /'PREMIUM_EXPIRING'/.test(sql) &&
                    /'BOT_UPDATE'/.test(sql) &&
                    /'VOTE'/.test(sql) &&
                    /'SERVER'/.test(sql) &&
                    /'REMIX'/.test(sql) &&
                    !/'PROFILE_UPDATED'/.test(
                        sql.match(
                            /CREATE TYPE[\s\S]*?\);/
                        )?.[0] ?? ""
                    ),
                sql.match(/CREATE TYPE[\s\S]*?\);/)?.[0]
            );

            check(
                "the column is repointed at the new type",
                /ALTER COLUMN "type" TYPE "public"\."NotificationType"/.test(
                    sql
                ) &&
                    /USING \("type"::text::"public"\."NotificationType"\)/.test(
                        sql
                    )
            );
        }
    })();
}

offline()
    .then(() => {
        console.log(
            `\n${passed} passed, ${failed} failed`
        );
    })
    .catch((error) => {
        console.error(error);
        failed += 1;
    })
    .finally(() => {
        process.exit(failed > 0 ? 1 : 0);
    });