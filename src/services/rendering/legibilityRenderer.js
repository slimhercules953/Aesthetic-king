const { createCanvas } = require("canvas");

const {
    THEME_LIST,
    bestTextOn,
    contrastRatio,
} = require("../colors/contrastService");

const WIDTH = 1000;
const PANEL_HEIGHT = 250;
const SWATCH_HEIGHT = 150;
const PADDING = 28;

const FONT_STACK = '"DejaVu Sans", "Segoe UI", Arial, sans-serif';

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/** Truncates with an ellipsis so long names can't overflow the mock-up. */
function fitText(ctx, text, maxWidth) {
    if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) {
        return text;
    }

    let cut = text;

    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
        cut = cut.slice(0, -1);
    }

    return `${cut}…`;
}

function drawThemePanel(ctx, { y, theme, username, color, ratio }) {
    const boxX = PADDING;
    const boxY = y + PADDING;
    const boxW = WIDTH - PADDING * 2;
    const boxH = PANEL_HEIGHT - PADDING * 2;

    const safeName =
        (typeof username === "string" && username.trim()) || "aesthetic";

    ctx.fillStyle = "#1f2124";
    ctx.fillRect(0, y, WIDTH, PANEL_HEIGHT);

    // Chat mock-up card
    roundedRect(ctx, boxX, boxY, boxW, boxH, 12);
    ctx.fillStyle = theme.background;
    ctx.fill();

    // Theme label tab
    ctx.font = `bold 15px ${FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#80848e";
    ctx.fillText(
        `${theme.name} THEME • ${theme.background.toUpperCase()}`,
        boxX,
        y + 6
    );

    // Avatar
    const avatarSize = 68;
    const avatarX = boxX + 22;
    const avatarY = boxY + 26;

    ctx.beginPath();
    ctx.arc(
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2,
        avatarSize / 2,
        0,
        Math.PI * 2
    );
    ctx.fillStyle = color;
    ctx.fill();

    const initial = [...safeName][0].toUpperCase();
    ctx.font = `bold 30px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = bestTextOn(color);
    ctx.fillText(
        initial,
        avatarX + avatarSize / 2,
        avatarY + avatarSize / 2 + 1
    );

    // Username line, exactly how Discord tints a role color
    const textX = avatarX + avatarSize + 18;
    const maxTextWidth = boxX + boxW - 22 - textX;

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold 22px ${FONT_STACK}`;
    ctx.fillStyle = color;

    const name = fitText(ctx, safeName, maxTextWidth * 0.62);

    ctx.fillText(name, textX, avatarY + 26);

    const nameWidth = ctx.measureText(name).width;

    ctx.font = `13px ${FONT_STACK}`;
    ctx.fillStyle = "#949ba4";
    ctx.fillText(
        fitText(
            ctx,
            `today at 9:41 AM   •   ${ratio.toFixed(2)}:1`,
            maxTextWidth - nameWidth - 12
        ),
        textX + nameWidth + 12,
        avatarY + 24
    );

    // Message body in the theme's own text color
    ctx.font = `17px ${FONT_STACK}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(
        fitText(
            ctx,
            "this is what your messages look like on top of this background",
            maxTextWidth
        ),
        textX,
        avatarY + 58
    );

    // Role chip, the other place a color gets used
    const chipY = avatarY + 82;
    const chipLabel = "@role color";

    ctx.font = `bold 15px ${FONT_STACK}`;
    const chipW = ctx.measureText(chipLabel).width + 22;

    roundedRect(ctx, textX, chipY, chipW, 28, 6);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.textBaseline = "middle";
    ctx.fillStyle = bestTextOn(color);
    ctx.fillText(chipLabel, textX + 11, chipY + 15);
}

function drawSwatchRow(ctx, { y, colors }) {
    ctx.fillStyle = "#1f2124";
    ctx.fillRect(0, y, WIDTH, SWATCH_HEIGHT);

    if (!colors.length) {
        return;
    }

    const gap = 12;
    const usable = WIDTH - PADDING * 2 - gap * (colors.length - 1);
    const swatchW = usable / colors.length;

    colors.forEach((entry, index) => {
        const x = PADDING + index * (swatchW + gap);
        const h = SWATCH_HEIGHT - PADDING * 2;

        roundedRect(ctx, x, y + PADDING, swatchW, h, 10);
        ctx.fillStyle = entry.hex;
        ctx.fill();

        const text = bestTextOn(entry.hex);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        ctx.font = `bold 17px ${FONT_STACK}`;
        ctx.fillStyle = text;
        ctx.fillText(entry.hex.toUpperCase(), x + swatchW / 2, y + PADDING + 30);

        ctx.font = `13px ${FONT_STACK}`;
        ctx.fillText(
            `D ${entry.onDark.ratio.toFixed(1)}`,
            x + swatchW / 2,
            y + PADDING + 60
        );
        ctx.fillText(
            `L ${entry.onLight.ratio.toFixed(1)}`,
            x + swatchW / 2,
            y + PADDING + 82
        );

        ctx.font = `bold 13px ${FONT_STACK}`;
        ctx.fillText(entry.badge, x + swatchW / 2, y + PADDING + 110);
    });
}

/**
 * @param {object} params
 * @param {string} params.username  text to preview (display name / username)
 * @param {string} params.color     the color being tested as a role color
 * @param {Array}  params.colors    analyzed colors for the swatch strip
 */
async function renderLegibilityPreview({
    username,
    color,
    colors = [],
}) {
    const height = PANEL_HEIGHT * THEME_LIST.length + SWATCH_HEIGHT;

    const canvas = createCanvas(WIDTH, height);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#1f2124";
    ctx.fillRect(0, 0, WIDTH, height);

    THEME_LIST.forEach((theme, index) => {
        drawThemePanel(ctx, {
            y: index * PANEL_HEIGHT,
            theme,
            username,
            color,
            // Each panel shows its own real ratio, not the caller's number.
            ratio: contrastRatio(color, theme.background),
        });
    });

    drawSwatchRow(ctx, {
        y: PANEL_HEIGHT * THEME_LIST.length,
        colors: colors.slice(0, 6),
    });

    return canvas.toBuffer("image/png");
}

module.exports = {
    renderLegibilityPreview,
};
