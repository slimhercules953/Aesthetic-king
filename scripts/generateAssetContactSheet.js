const fs = require("fs");

const {
    createCanvas,
    loadImage,
} = require("canvas");

const {
    getCompleteProfileSets,
} = require("../src/services/assets/assetService");

const logger = require("../src/utils/logger");

const CARD_WIDTH = 320;
const CARD_HEIGHT = 260;
const COLUMNS = 4;

function drawImageCover(
    ctx,
    image,
    x,
    y,
    width,
    height
) {
    const imageRatio =
        image.width / image.height;

    const targetRatio =
        width / height;

    let sourceWidth;
    let sourceHeight;
    let sourceX;
    let sourceY;

    if (imageRatio > targetRatio) {
        sourceHeight = image.height;
        sourceWidth =
            image.height * targetRatio;

        sourceX =
            (image.width - sourceWidth) / 2;

        sourceY = 0;
    } else {
        sourceWidth = image.width;
        sourceHeight =
            image.width / targetRatio;

        sourceX = 0;

        sourceY =
            (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        x,
        y,
        width,
        height
    );
}

async function generateContactSheet() {
    logger.info(
        "Generating asset contact sheet..."
    );

    const sets =
        await getCompleteProfileSets();

    const rows =
        Math.ceil(
            sets.length / COLUMNS
        );

    const canvas =
        createCanvas(
            CARD_WIDTH * COLUMNS,
            CARD_HEIGHT * rows
        );

    const ctx =
        canvas.getContext("2d");

    ctx.fillStyle = "#111214";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    for (
        let index = 0;
        index < sets.length;
        index++
    ) {
        const set = sets[index];

        const column =
            index % COLUMNS;

        const row =
            Math.floor(
                index / COLUMNS
            );

        const x =
            column * CARD_WIDTH;

        const y =
            row * CARD_HEIGHT;

        const [
            pfp,
            banner,
        ] = await Promise.all([
            loadImage(
                set.pfp.url
            ),
            loadImage(
                set.banner.url
            ),
        ]);

        ctx.fillStyle = "#1E1F22";

        ctx.fillRect(
            x + 10,
            y + 10,
            CARD_WIDTH - 20,
            CARD_HEIGHT - 20
        );

        drawImageCover(
            ctx,
            banner,
            x + 20,
            y + 20,
            CARD_WIDTH - 40,
            105
        );

        ctx.save();

        ctx.beginPath();

        ctx.arc(
            x + 80,
            y + 165,
            48,
            0,
            Math.PI * 2
        );

        ctx.clip();

        drawImageCover(
            ctx,
            pfp,
            x + 32,
            y + 117,
            96,
            96
        );

        ctx.restore();

        ctx.fillStyle = "#F2F3F5";
        ctx.font = "bold 28px Arial";

        ctx.fillText(
            `Set ${set.id}`,
            x + 150,
            y + 160
        );

        ctx.fillStyle = "#B5BAC1";
        ctx.font = "18px Arial";

        ctx.fillText(
            "PFP + Banner",
            x + 150,
            y + 195
        );
    }

    const buffer =
        canvas.toBuffer(
            "image/png"
        );

    fs.writeFileSync(
        "asset-contact-sheet.png",
        buffer
    );

    logger.success(
        `Created contact sheet for ${sets.length} profile sets.`
    );

    console.log("");
    console.log(
        "Created: asset-contact-sheet.png"
    );
}

generateContactSheet().catch(
    (error) => {
        logger.error(
            "Failed to generate asset contact sheet.",
            error
        );

        process.exit(1);
    }
);