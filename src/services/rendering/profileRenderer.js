const {
    createCanvas,
    loadImage,
} = require("canvas");

const BODY_FONT =
    '"Segoe UI Symbol", "DejaVu Sans", Arial, sans-serif';

const SAFE_SYMBOL_REPLACEMENTS = new Map([
    ["𖤐", "✦"],
    ["꩜", "✧"],
    ["𓆩♡𓆪", "♡"],
    ["꒰ა", "♡"],
    ["໒꒱", "♡"],
    ["𖡼", "✿"],
    ["𖤣", "✦"],
    ["𖥧", "✧"],
]);

function sanitizeCanvasText(text) {
    if (!text) {
        return "";
    }

    let sanitized = text;

    for (
        const [symbol, replacement]
        of SAFE_SYMBOL_REPLACEMENTS
    ) {
        sanitized = sanitized.replaceAll(
            symbol,
            replacement
        );
    }

    return sanitized;
}

function drawRoundedRect(
    ctx,
    x,
    y,
    width,
    height,
    radius,
    color
) {
    ctx.beginPath();
    ctx.roundRect(
        x,
        y,
        width,
        height,
        radius
    );

    ctx.fillStyle = color;
    ctx.fill();
}

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

function drawWrappedText(
    ctx,
    text,
    x,
    y,
    maxWidth,
    lineHeight,
    maxLines = 3
) {
    const words = text.split(/\s+/);

    let line = "";
    let currentY = y;
    let linesDrawn = 0;

    for (let index = 0; index < words.length; index++) {
        const word = words[index];

        const testLine =
            line.length > 0
                ? `${line} ${word}`
                : word;

        const testWidth =
            ctx.measureText(
                testLine
            ).width;

        if (
            testWidth > maxWidth &&
            line.length > 0
        ) {
            ctx.fillText(
                line,
                x,
                currentY
            );

            linesDrawn++;

            if (
                linesDrawn >= maxLines
            ) {
                return (
                    currentY +
                    lineHeight
                );
            }

            line = word;

            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }

    if (
        line.length > 0 &&
        linesDrawn < maxLines
    ) {
        ctx.fillText(
            line,
            x,
            currentY
        );

        currentY += lineHeight;
    }

    return currentY;
}

function drawCircularImage(
    ctx,
    image,
    centerX,
    centerY,
    radius
) {
    ctx.save();

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        radius,
        0,
        Math.PI * 2
    );

    ctx.closePath();
    ctx.clip();

    drawImageCover(
        ctx,
        image,
        centerX - radius,
        centerY - radius,
        radius * 2,
        radius * 2
    );

    ctx.restore();
}

function getContrastTextColor(hexColor) {
    const hex = hexColor.replace("#", "");

    const r = parseInt(
        hex.substring(0, 2),
        16
    );

    const g = parseInt(
        hex.substring(2, 4),
        16
    );

    const b = parseInt(
        hex.substring(4, 6),
        16
    );

    // Relative perceived brightness.
    const luminance =
        (0.299 * r) +
        (0.587 * g) +
        (0.114 * b);

    return luminance > 160
        ? "#000000"
        : "#FFFFFF";
}

async function renderProfilePreview({
    pfpUrl,
    bannerUrl,
    colors,
    username = "Aesthetic King",
    bio = "building an aesthetic identity ✦",
}) {
    if (!pfpUrl) {
        throw new Error(
            "A profile picture URL is required."
        );
    }

    if (!bannerUrl) {
        throw new Error(
            "A banner URL is required."
        );
    }

    if (!colors || colors.length < 2) {
        throw new Error(
            "At least two colors are required."
        );
    }

    const primaryColor =
        colors[0].hex;

    const secondaryColor =
        colors[1].hex;

    const backgroundColor =
        colors[4]?.hex || "#111214";

    const canvasWidth = 900;
    const canvasHeight = 960;
    const canvas = createCanvas(
        canvasWidth,
        canvasHeight
    );

    const ctx = canvas.getContext("2d");

    const [
        pfpImage,
        bannerImage,
    ] = await Promise.all([
        loadImage(pfpUrl),
        loadImage(bannerUrl),
    ]);

    // Background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(
        0,
        0,
        canvasWidth,
        canvasHeight
    );

    // Main card
    drawRoundedRect(
        ctx,
        70,
        60,
        760,
        840,
        28,
        "#1E1F22"
    );

    // Banner
    ctx.save();

    ctx.beginPath();
    ctx.roundRect(
        70,
        60,
        760,
        275,
        [28, 28, 0, 0]
    );

    ctx.clip();

    drawImageCover(
        ctx,
        bannerImage,
        70,
        60,
        760,
        275
    );

    ctx.restore();

    // Avatar border
    ctx.beginPath();

    ctx.arc(
        205,
        330,
        105,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#1E1F22";
    ctx.fill();

    // Avatar
    drawCircularImage(
        ctx,
        pfpImage,
        205,
        330,
        91
    );

    // Online indicator border
    ctx.beginPath();

    ctx.arc(
        272,
        392,
        25,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#1E1F22";
    ctx.fill();

    // Online indicator
    ctx.beginPath();

    ctx.arc(
        272,
        392,
        17,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#23A55A";
    ctx.fill();

    // Username
    ctx.fillStyle = "#F2F3F5";
    ctx.font = `bold 34px ${BODY_FONT}`;

    ctx.fillText(
        username,
        130,
        475
    );
    const canvasBio =
        sanitizeCanvasText(bio);
    // Bio
    ctx.fillStyle = "#B5BAC1";
    ctx.font = `24px ${BODY_FONT}`;

    const bioBottomY =
        drawWrappedText(
            ctx,
            canvasBio,
            130,
            520,
            640,
            32,
            3
        );

    // Divider
    const dividerY =
        Math.max(
            bioBottomY + 20,
            575
        );

    ctx.fillStyle = "#2B2D31";

    ctx.fillRect(
        130,
        dividerY,
        640,
        2
    );

    // Palette heading
    const paletteHeadingY =
        dividerY + 55;

    ctx.fillStyle = "#F2F3F5";
    ctx.font = `bold 25px ${BODY_FONT}`;
    
    ctx.fillText(
        "Profile Palette",
        130,
        paletteHeadingY
    );

    // Palette boxes
    const paletteBoxY =
        paletteHeadingY + 35;

    const paletteBoxHeight = 105;

    drawRoundedRect(
        ctx,
        130,
        paletteBoxY,
        295,
        paletteBoxHeight,
        18,
        primaryColor
    );

    drawRoundedRect(
        ctx,
        475,
        paletteBoxY,
        295,
        paletteBoxHeight,
        18,
        secondaryColor
    );

    // Hex labels
    const paletteTextY =
        paletteBoxY + 65;

    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";

    // Primary hex label
    ctx.fillStyle =
        getContrastTextColor(
            primaryColor
        );

    ctx.fillText(
        primaryColor,
        277,
        paletteTextY
    );

    // Secondary hex label
    ctx.fillStyle =
        getContrastTextColor(
            secondaryColor
        );

    ctx.fillText(
        secondaryColor,
        622,
        paletteTextY
    );

    ctx.textAlign = "start";

    // Footer
    const footerY =
        paletteBoxY +
        paletteBoxHeight +
        32;

    ctx.fillStyle = "#949BA4";
    ctx.font = "18px Arial";

    ctx.fillText(
        "Aesthetic King • Profile Preview",
        130,
        footerY
    );

    return canvas.toBuffer("image/png");
}

module.exports = {
    renderProfilePreview,
};