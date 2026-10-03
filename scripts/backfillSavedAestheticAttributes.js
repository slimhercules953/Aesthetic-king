/**
 * Fills in the mood and color of saved aesthetics stored before the
 * generator started recording them.
 *
 * Those rows kept the filters the user typed, so a run with no --mood and
 * no --color has two blanks even though its profile set is full of mood and
 * color tags. The set id was kept, so the attributes can be recovered with
 * the same helper the generator uses.
 *
 * Rows that already have a value are left alone, and so is any row whose
 * profile set is no longer in the catalog — a guess would be worse than a
 * blank. Names are never touched; a name the user wrote is theirs.
 *
 * Dry run by default. Pass --apply to write.
 *
 * Usage: node scripts/backfillSavedAestheticAttributes.js [--apply]
 */

const assetCatalog = require("../src/data/assetCatalog.json");

const {
    resolveProfileSetAttributes,
} = require("../src/services/aesthetics/aestheticService");

const {
    prisma,
    connectDatabase,
    disconnectDatabase,
} = require("../src/services/database/prisma");

const apply =
    process.argv.includes("--apply");

function describe(row) {
    return (
        `${row.name} ` +
        `(${row.aestheticId}, set ${row.profileSetId}) ` +
        `${row.moodId || "—"}/${row.colorFilter || "—"}`
    );
}

async function main() {
    await connectDatabase();

    const rows =
        await prisma.savedAesthetic.findMany({
            where: {
                profileSetId: {
                    not: null,
                },

                OR: [
                    { moodId: null },
                    { colorFilter: null },
                ],
            },

            orderBy: {
                createdAt: "asc",
            },
        });

    console.log("");
    console.log(
        `Rows missing a mood or color: ${rows.length}`
    );
    console.log("");

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
        const set = assetCatalog.find(
            (candidate) =>
                String(candidate.id) ===
                String(row.profileSetId)
        );

        if (!set) {
            skipped += 1;
            console.log(
                `  skip  ${describe(row)} — set not in catalog`
            );
            continue;
        }

        /*
         * The stored values are passed as the filters so a half-filled
         * row keeps the half it already had.
         */
        const resolved =
            resolveProfileSetAttributes(set, {
                color: row.colorFilter,
                mood: row.moodId,
            });

        if (
            resolved.color === row.colorFilter &&
            resolved.mood === row.moodId
        ) {
            skipped += 1;
            console.log(
                `  skip  ${describe(row)} — nothing to resolve`
            );
            continue;
        }

        if (apply) {
            await prisma.savedAesthetic.update({
                where: {
                    id: row.id,
                },

                data: {
                    moodId: resolved.mood,
                    colorFilter: resolved.color,
                },
            });
        }

        updated += 1;

        console.log(
            `  ${apply ? "update" : "would"}  ${describe(row)} -> ` +
            `${resolved.color}/${resolved.mood}`
        );
    }

    console.log("");
    console.log(
        `${apply ? "Updated" : "Would update"}: ${updated}  ` +
        `Skipped: ${skipped}`
    );

    if (!apply && updated > 0) {
        console.log("");
        console.log(
            "Re-run with --apply to write these changes."
        );
    }
}

main()
    .catch((error) => {
        console.error(
            `Backfill failed: ${error.message}`
        );

        process.exitCode = 1;
    })
    .finally(async () => {
        await disconnectDatabase();
    });
