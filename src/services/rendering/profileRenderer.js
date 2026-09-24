const {
    createCanvas,
    loadImage,
} = require("canvas");

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
    const canvasHeight = 900;

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
        780,
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
    ctx.font = "bold 34px Arial";

    ctx.fillText(
        username,
        130,
        475
    );

    // Bio
    ctx.fillStyle = "#B5BAC1";
    ctx.font = "24px Arial";

    ctx.fillText(
        bio,
        130,
        520
    );

    // Divider
    ctx.fillStyle = "#2B2D31";

    ctx.fillRect(
        130,
        555,
        640,
        2
    );

    // Palette heading
    ctx.fillStyle = "#F2F3F5";
    ctx.font = "bold 25px Arial";

    ctx.fillText(
        "Profile Palette",
        130,
        610
    );

    // Primary color
    drawRoundedRect(
        ctx,
        130,
        645,
        295,
        105,
        18,
        primaryColor
    );

    // Secondary color
    drawRoundedRect(
        ctx,
        475,
        645,
        295,
        105,
        18,
        secondaryColor
    );

    // Hex labels
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";

    ctx.fillText(
        primaryColor,
        277,
        710
    );

    ctx.fillText(
        secondaryColor,
        622,
        710
    );

    ctx.textAlign = "start";

    // Footer
    ctx.fillStyle = "#949BA4";
    ctx.font = "18px Arial";

    ctx.fillText(
        "Aesthetic King • Profile Preview",
        130,
        800
    );

    return canvas.toBuffer("image/png");
}

module.exports = {
    renderProfilePreview,
};