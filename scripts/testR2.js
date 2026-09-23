const assetService = require("../src/services/assets/assetService");
const logger = require("../src/utils/logger");

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