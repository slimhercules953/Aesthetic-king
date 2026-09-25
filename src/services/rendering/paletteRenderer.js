const {
    createCanvas,
} = require("canvas");

const WIDTH = 1000;
const HEIGHT = 300;

function getTextColor(
    hex
) {
    const clean =
        hex.replace(
            "#",
            ""
        );

    const r =
        parseInt(
            clean.substring(
                0,
                2
            ),
            16
        );

    const g =
        parseInt(
            clean.substring(
                2,
                4
            ),
            16
        );

    const b =
        parseInt(
            clean.substring(
                4,
                6
            ),
            16
        );

    const luminance =
        0.299 * r +
        0.587 * g +
        0.114 * b;

    return luminance > 160
        ? "#000000"
        : "#FFFFFF";
}

async function renderPalette({
    colors,
}) {
    const canvas =
        createCanvas(
            WIDTH,
            HEIGHT
        );

    const ctx =
        canvas.getContext(
            "2d"
        );

    const swatchWidth =
        WIDTH /
        colors.length;

    colors.forEach(
        (
            color,
            index
        ) => {
            const x =
                index *
                swatchWidth;

            ctx.fillStyle =
                color;

            ctx.fillRect(
                x,
                0,
                swatchWidth,
                HEIGHT
            );

            ctx.fillStyle =
                getTextColor(
                    color
                );

            ctx.font =
                'bold 28px "DejaVu Sans", Arial, sans-serif';

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "middle";

            ctx.fillText(
                color,
                x +
                    swatchWidth /
                        2,
                HEIGHT / 2
            );
        }
    );

    return canvas.toBuffer(
        "image/png"
    );
}

module.exports = {
    renderPalette,
};