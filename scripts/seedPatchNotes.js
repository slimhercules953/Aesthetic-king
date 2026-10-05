#!/usr/bin/env node
"use strict";

/**
 * Publishes changelog entries into the PatchNote table.
 *
 * `/patch-notes` on the bot and the bell on the Studio both read PatchNote,
 * but nothing else writes it. This script is that writer: it reads a JSON
 * file of releases and upserts each one by its `version`, so re-running it
 * after editing the wording of a release updates it in place rather than
 * duplicating it.
 *
 * Input format (see patch-notes.example.json):
 *   [
 *     {
 *       "version": "2.4.0",
 *       "title": "Patch notes, voting and Crowns",
 *       "body": "• /patch-notes shows what changed\n• /vote lists the sites",
 *       "publishedAt": "2026-10-05T00:00:00.000Z"   // optional
 *     }
 *   ]
 *
 * `publishedAt` matters: a note dated in the future is invisible to both the
 * command and the bell, which lets you stage a release ahead of time. Omit it
 * to publish immediately.
 *
 * Usage:
 *   node scripts/seedPatchNotes.js path/to/notes.json            preview
 *   node scripts/seedPatchNotes.js path/to/notes.json --apply    write
 */

const fs = require("fs");
const path = require("path");

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const inputArg = process.argv.slice(2).find((a) => !a.startsWith("--"));

function fail(message) {
    console.error(`\n✗ ${message}\n`);
    process.exit(1);
}

function loadEntries() {
    if (!inputArg) {
        fail(
            "Usage: node scripts/seedPatchNotes.js <notes.json> [--apply]\n" +
            "       See scripts/patch-notes.example.json for the format."
        );
    }

    const file = path.resolve(process.cwd(), inputArg);
    if (!fs.existsSync(file)) {
        fail(`No such file: ${file}`);
    }

    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
        fail(`${file} is not valid JSON: ${err.message}`);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        fail(`${file} must contain a non-empty array of releases.`);
    }

    return parsed.map((entry, i) => validate(entry, i, file));
}

function validate(entry, index, file) {
    const where = `${file}[${index}]`;

    if (!entry || typeof entry !== "object") {
        fail(`${where} is not an object.`);
    }

    const version = String(entry.version ?? "").trim();
    const title = String(entry.title ?? "").trim();
    const body = String(entry.body ?? "").trim();

    if (!version) fail(`${where} has no "version".`);
    if (version.length > 40) fail(`${where} version is longer than 40 chars.`);
    if (!title) fail(`${where} has no "title".`);
    if (title.length > 120) fail(`${where} title is longer than 120 chars.`);
    if (!body) fail(`${where} has no "body".`);

    let publishedAt = new Date();
    if (entry.publishedAt !== undefined && entry.publishedAt !== null) {
        publishedAt = new Date(entry.publishedAt);
        if (Number.isNaN(publishedAt.getTime())) {
            fail(`${where} has an unparseable "publishedAt".`);
        }
    }

    return { version, title, body, publishedAt };
}

async function main() {
    const entries = loadEntries();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  Patch notes — ${entries.length} release(s)`);
    console.log(`  Mode: ${APPLY ? "APPLY" : "preview (no writes)"}`);
    console.log("=".repeat(60));

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const entry of entries) {
        const existing = await prisma.patchNote.findUnique({
            where: { version: entry.version },
        });

        const same =
            existing &&
            existing.title === entry.title &&
            existing.body === entry.body &&
            existing.publishedAt.getTime() ===
            entry.publishedAt.getTime();

        const label = same
            ? "unchanged"
            : existing
                ? "update"
                : "new";

        console.log(
            `\n  [${label}] ${entry.version} — ${entry.title}` +
            `\n           published ${entry.publishedAt.toISOString()}` +
            (entry.publishedAt > new Date()
                ? "  (in the future — hidden until then)"
                : "")
        );

        if (same) {
            unchanged += 1;
            continue;
        }

        if (existing) updated += 1; else inserted += 1;

        if (!APPLY) continue;

        await prisma.patchNote.upsert({
            where: { version: entry.version },
            create: {
                version: entry.version,
                title: entry.title,
                body: entry.body,
                publishedAt: entry.publishedAt,
            },
            update: {
                title: entry.title,
                body: entry.body,
                publishedAt: entry.publishedAt,
            },
        });
    }

    console.log(
        `\n  ${inserted} new, ${updated} updated, ${unchanged} unchanged.`
    );

    if (!APPLY) {
        console.log(
            "\n  Preview only. Re-run with --apply to write these rows.\n"
        );
        return;
    }

    /*
     * The bot caches the latest release for a minute so that the "there's a
     * new update" hint isn't a query per command. A fresh deploy restarts the
     * process anyway, but publishing against a running bot would otherwise go
     * unnoticed for that minute.
     */
    try {
        require("../src/services/database/patchNoteService").clearPatchNoteCache();
        console.log("  Cleared the bot's patch-note cache.");
    } catch {
        // Not running inside the bot process — nothing to clear.
    }

    console.log(
        "\n  Done. Run `node scripts/deployGlobalCommands.js` if you have not" +
        "\n  registered /patch-notes yet.\n"
    );
}

main()
    .catch((err) => {
        console.error("\n✗ Failed:", err?.message || err, "\n");
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
