/*
 * Reports the provenance of every set in src/data/assetCatalog.json.
 *
 * The bot rehosts these images in Cloudflare R2 and renders them into
 * cards that users download, so each one is reproduced, distributed and
 * publicly displayed by us. That is only lawful when we own the image or
 * hold a licence that permits commercial use, and "we think it came from
 * Pinterest" is neither. This script exists so the answer is a number in
 * CI rather than a memory.
 *
 * Exit codes:
 *   0  every enabled set has a cleared licence
 *   1  at least one set is unlicensed, unknown, or a CC-BY set missing
 *      its attribution string
 *
 * Usage:
 *   node scripts/auditAssetLicenses.js          # human-readable report
 *   node scripts/auditAssetLicenses.js --json   # machine-readable
 *   node scripts/auditAssetLicenses.js --quiet  # exit code only
 */

const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

/*
 * Kinds that grant the rights the bot actually needs. `unknown` and a
 * missing licence are both failures; there is no "probably fine".
 */
const CLEARED_KINDS = new Set([
    "owned",
    "generated",
    "public-domain",
    "cc0",
    "cc-by",
    "stock",
    "licensed",
]);

/*
 * Kinds that require us to show credit. Shipping one without the
 * attribution string is infringement with extra steps, so it fails the
 * audit even though the kind itself is cleared.
 */
const ATTRIBUTION_REQUIRED_KINDS = new Set(["cc-by"]);

function classify(entry) {
    const license = entry.license;

    if (!license) {
        return { ok: false, reason: "no license recorded" };
    }

    if (!license.kind) {
        return { ok: false, reason: "license.kind is empty" };
    }

    if (license.kind === "unknown") {
        return { ok: false, reason: "provenance explicitly unknown" };
    }

    if (!CLEARED_KINDS.has(license.kind)) {
        return { ok: false, reason: `kind "${license.kind}" is not cleared` };
    }

    if (license.commercialUse === false) {
        return { ok: false, reason: "license.commercialUse is false" };
    }

    if (
        ATTRIBUTION_REQUIRED_KINDS.has(license.kind) &&
        !(license.attribution || "").trim()
    ) {
        return { ok: false, reason: `${license.kind} needs an attribution string` };
    }

    return { ok: true, reason: "" };
}

function audit() {
    if (!fs.existsSync(CATALOG_PATH)) {
        throw new Error(`Missing catalog: ${CATALOG_PATH}`);
    }

    const catalog = JSON.parse(
        fs.readFileSync(CATALOG_PATH, "utf8")
    );

    const results = catalog.map((entry) => ({
        id: entry.id,
        enabled: entry.enabled !== false,
        premium: entry.premium === true,
        kind: entry.license?.kind ?? "unrecorded",
        source: entry.license?.source ?? "",
        ...classify(entry),
    }));

    const enabled = results.filter((r) => r.enabled);
    const failures = enabled.filter((r) => !r.ok);

    const byKind = {};

    for (const entry of enabled) {
        byKind[entry.kind] = (byKind[entry.kind] || 0) + 1;
    }

    return { catalog, results, enabled, failures, byKind };
}

function report({ enabled, failures, byKind }) {
    console.log("");
    console.log(`Asset licence audit (${enabled.length} enabled sets)`);
    console.log("=".repeat(48));

    const ranked = Object.entries(byKind).sort((a, b) => b[1] - a[1]);

    for (const [kind, count] of ranked) {
        const marker = CLEARED_KINDS.has(kind) ? "ok  " : "FAIL";
        console.log(`  ${marker}  ${String(kind).padEnd(16)} ${count}`);
    }

    console.log("");

    if (failures.length === 0) {
        console.log("Every enabled set has a cleared commercial licence.");
        return;
    }

    console.log(`${failures.length} set(s) cannot be legally sold:`);
    console.log("");

    for (const failure of failures) {
        const premium = failure.premium ? " [premium]" : "";
        console.log(
            `  #${failure.id}${premium}  ${failure.reason}` +
            (failure.source ? `  (source: ${failure.source})` : "")
        );
    }

    console.log("");
    console.log(
        "Record provenance in src/data/assetCatalog.json under `license`, or\n" +
        "disable the set with `\"enabled\": false` until you can."
    );
}

function main() {
    const args = process.argv.slice(2);
    const result = audit();

    if (args.includes("--json")) {
        console.log(JSON.stringify(result.failures, null, 2));
    } else if (!args.includes("--quiet")) {
        report(result);
    }

    process.exit(result.failures.length > 0 ? 1 : 0);
}

try {
    main();
} catch (error) {
    console.error(`Licence audit failed: ${error.message}`);
    process.exit(1);
}
