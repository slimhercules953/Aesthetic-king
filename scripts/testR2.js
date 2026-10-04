const logger = require("../src/utils/logger");

/*
 * This is a live diagnostic, not a unit test: it lists real objects in the
 * real bucket. Without credentials there is nothing to assert, and failing
 * for that reason would make CI red on every commit for something that is
 * simply not configured in that environment.
 *
 * dotenv is loaded explicitly because the guard below runs before anything
 * else pulls it in, and the asset service builds an S3 client at require
 * time — so the check has to happen first.
 */
require("dotenv").config();

const R2_ENV_VARS = [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
];

const missing = R2_ENV_VARS.filter((name) => !process.env[name]);

if (missing.length > 0) {
    logger.warn(
        `Skipping R2 diagnostic — unset ${missing.join(", ")}.`
    );

    console.log("0 passed, 0 failed (skipped: no R2 credentials)");
    process.exit(0);
}

const assetService = require("../src/services/assets/assetService");

async function testR2() {
    logger.info("Testing Cloudflare R2 connection...");

    const objects = await assetService.listAssetObjects();
    const sets = await assetService.getProfileSets();
    const completeSets = await assetService.getCompleteProfileSets();

    logger.success("R2 connection successful.");

    console.log("");
    console.log(`Objects found: ${objects.length}`);
    console.log(`Profile sets found: ${sets.length}`);
    console.log(`Complete profile sets: ${completeSets.length}`);

    if (completeSets.length > 0) {
        const example = completeSets[0];

        console.log("");
        console.log("Example complete set:");
        console.log(`ID: ${example.id}`);
        console.log(`PFP: ${example.pfp.key}`);
        console.log(`Banner: ${example.banner.key}`);
        console.log(`PFP URL: ${example.pfp.url || "Not configured"}`);
        console.log(`Banner URL: ${example.banner.url || "Not configured"}`);
    }
}

testR2().catch((error) => {
    logger.error(
        "R2 diagnostic failed.",
        error
    );

    process.exit(1);
});