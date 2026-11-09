/*
 * Theme asset generator.
 *
 * The abstract generator (generateProceduralAssets.js) produces gradient
 * and texture work. This one produces *subjects*: a moon, a mountain
 * range, a rose, a skyline, rain on glass. The existing library is built
 * on recognizable things, and a curator searching "moon" or "flowers"
 * expects to see a moon or flowers, so every theme here draws an object
 * the user can name.
 *
 * Everything is drawn from primitives with no external input, so the
 * output is owned outright and can be sold.
 */

const fs = require("fs");
const path = require("path");

const { createCanvas } = require("canvas");
const logger = require("../src/utils/logger");

const {
    makeRandom,
    pick,
    range,
    rgba,
    mix,
    addGrain,
    addVignette,
    radialBlob,
} = require("./generateProceduralAssets");

const OUTPUT_DIR = path.join(__dirname, "..", "generated-assets", "themes");

const PFP_SIZE = 4096;
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 1080;

/* --- drawing primitives ------------------------------------------- */

function layer(width, height, draw) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    draw(ctx, width, height);
    return canvas;
}

function verticalGradient(ctx, width, height, stops) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);

    stops.forEach((hex, index) => {
        gradient.addColorStop(stops.length === 1 ? 0 : index / (stops.length - 1), hex);
    });

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

/*
 * Midpoint displacement. Used for anything that has to look like terrain
 * rather than a wave: a sum of sines always reads as rolling hills, while
 * recursive subdivision gives the sharp irregular peaks that make a
 * mountain read as a mountain at thumbnail size.
 */
function ridgeHeights(random, steps, roughness) {
    const count = 2 ** steps + 1;
    const heights = new Array(count).fill(0);

    heights[0] = random();
    heights[count - 1] = random();

    let amplitude = 1;
    let span = count - 1;

    while (span > 1) {
        const half = span / 2;

        for (let i = half; i < count; i += span) {
            heights[i] = (heights[i - half] + heights[i + half]) / 2 + (random() - 0.5) * amplitude;
        }

        amplitude *= roughness;
        span = half;
    }

    const min = Math.min(...heights);
    const max = Math.max(...heights);
    const spanValue = max - min || 1;

    return heights.map((h) => (h - min) / spanValue);
}

function sampleRidge(heights, t) {
    const scaled = Math.min(0.9999, Math.max(0, t)) * (heights.length - 1);
    const index = Math.floor(scaled);
    const frac = scaled - index;

    return heights[index] * (1 - frac) + heights[index + 1] * frac;
}

/*
 * A ridge silhouette. `peak` sharpens the profile: 1 is linear, higher
 * values pinch the ridgeline into peaks and flatten the valleys.
 */
function fillRidge(ctx, width, height, heights, topY, amplitude, color, peak) {
    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let x = 0; x <= width; x += 2) {
        const t = x / width;
        let h = sampleRidge(heights, t);

        if (peak !== 1) {
            h = h ** peak;
        }

        ctx.lineTo(x, topY - h * amplitude);
    }

    ctx.lineTo(width, height);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
}

function starField(ctx, width, height, random, count, color, maxRadius) {
    ctx.save();

    for (let i = 0; i < count; i += 1) {
        const x = random() * width;
        const y = random() * height;
        const radius = random() ** 3 * maxRadius + 0.4;
        const alpha = 0.25 + random() * 0.75;

        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

/*
 * A four-point flare on the brightest stars. Without it a field of dots
 * reads as noise; the cross is what makes it read as "night sky".
 */
function brightStars(ctx, width, height, random, count, color, size) {
    ctx.save();
    ctx.strokeStyle = rgba(color, 0.85);
    ctx.lineCap = "round";

    for (let i = 0; i < count; i += 1) {
        const x = random() * width;
        const y = random() * height * 0.8;
        const arm = size * (0.5 + random());

        ctx.lineWidth = Math.max(1, arm * 0.09);
        ctx.beginPath();
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
        ctx.stroke();

        ctx.fillStyle = rgba(color, 0.95);
        ctx.beginPath();
        ctx.arc(x, y, arm * 0.22, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function softCloud(ctx, x, y, radius, color, alpha, puffs) {
    ctx.save();
    ctx.filter = `blur(${Math.round(radius * 0.35)}px)`;

    for (let i = 0; i < puffs; i += 1) {
        const angle = (i / puffs) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius * 0.55;
        const py = y + Math.sin(angle) * radius * 0.22;
        const pr = radius * (0.4 + ((i * 37) % 11) / 30);

        ctx.fillStyle = rgba(color, alpha);
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.fillStyle = rgba(color, alpha);
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function pineTree(ctx, x, baseY, height, width, color) {
    const tiers = 5;

    ctx.fillStyle = color;
    ctx.fillRect(x - width * 0.05, baseY - height * 0.12, width * 0.1, height * 0.14);

    for (let i = 0; i < tiers; i += 1) {
        const t = i / tiers;
        const tierBottom = baseY - height * 0.08 - t * height * 0.72;
        const tierHeight = height * (0.34 - t * 0.04);
        const tierWidth = width * (1 - t * 0.72);

        ctx.beginPath();
        ctx.moveTo(x, tierBottom - tierHeight);
        ctx.lineTo(x + tierWidth / 2, tierBottom);
        ctx.lineTo(x - tierWidth / 2, tierBottom);
        ctx.closePath();
        ctx.fill();
    }
}

/*
 * A teardrop petal pointing outward from (cx, cy) at `angle`. Bezier
 * rather than an ellipse so the tip can be sharp, which is what separates
 * a drawn flower from a ring of blobs.
 */
function petal(ctx, cx, cy, angle, length, width, color) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const tipX = cx + cos * length;
    const tipY = cy + sin * length;

    const perpX = -sin;
    const perpY = cos;

    const midX = cx + cos * length * 0.5;
    const midY = cy + sin * length * 0.5;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.bezierCurveTo(
        midX + perpX * width,
        midY + perpY * width,
        tipX + perpX * width * 0.35,
        tipY + perpY * width * 0.35,
        tipX,
        tipY
    );
    ctx.bezierCurveTo(
        tipX - perpX * width * 0.35,
        tipY - perpY * width * 0.35,
        midX - perpX * width,
        midY - perpY * width,
        cx,
        cy
    );
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
}

function roseBloom(ctx, cx, cy, radius, outer, inner, random) {
    /*
     * Rings of overlapping petals from the outside in, each ring smaller,
     * rotated and lighter. The lightening is what creates the spiral
     * illusion; a single flat colour makes the bloom read as a disc.
     */
    const rings = 6;

    for (let ring = 0; ring < rings; ring += 1) {
        const t = ring / (rings - 1);
        const ringRadius = radius * (1 - t * 0.78);
        const count = Math.max(4, Math.round(9 - ring));
        const color = mix(outer, inner, t);
        const offset = ring * 0.42 + random() * 0.1;

        for (let i = 0; i < count; i += 1) {
            const angle = offset + (i / count) * Math.PI * 2;
            const px = cx + Math.cos(angle) * ringRadius * 0.34;
            const py = cy + Math.sin(angle) * ringRadius * 0.34;

            petal(ctx, px, py, angle, ringRadius, ringRadius * 0.72, color);
        }
    }

    ctx.fillStyle = mix(inner, "#000000", 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.12, 0, Math.PI * 2);
    ctx.fill();
}

function leaf(ctx, cx, cy, angle, length, width, color) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tipX = cx + cos * length;
    const tipY = cy + sin * length;
    const midX = cx + cos * length * 0.5;
    const midY = cy + sin * length * 0.5;
    const perpX = -sin;
    const perpY = cos;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(midX + perpX * width, midY + perpY * width, tipX, tipY);
    ctx.quadraticCurveTo(midX - perpX * width, midY - perpY * width, cx, cy);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
}

function bird(ctx, x, y, size, color, flap) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, size * 0.16);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.quadraticCurveTo(x - size * 0.45, y - size * flap, x, y + size * 0.12);
    ctx.quadraticCurveTo(x + size * 0.45, y - size * flap, x + size, y);
    ctx.stroke();
    ctx.restore();
}

function drawPortrait(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.52, height * 0.38, height * 0.6, v.glow, 0.45);

    const cx = width * range(random, 0.43, 0.57);
    const scale = Math.min(width, height);
    const skin = pick(random, ["#f1c7a5", "#d99a72", "#a9684e", "#754a3b", "#e7b994"]);
    const hair = pick(random, [v.dark, "#17131b", "#39251e", "#76503b", "#d2a35f"]);
    const jacket = mix(v.subject, v.dark, 0.28);
    const headY = height * 0.34;
    const headW = scale * 0.205;
    const headH = scale * 0.275;

    ctx.fillStyle = rgba(v.accent, 0.16);
    ctx.beginPath();
    ctx.ellipse(cx, headY + headH * 1.75, scale * 0.31, scale * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    const jacketShade = ctx.createLinearGradient(cx - scale * 0.34, 0, cx + scale * 0.34, 0);
    jacketShade.addColorStop(0, mix(jacket, v.dark, 0.32));
    jacketShade.addColorStop(0.5, mix(jacket, "#ffffff", 0.12));
    jacketShade.addColorStop(1, mix(jacket, v.dark, 0.2));
    ctx.fillStyle = jacketShade;
    ctx.beginPath();
    ctx.moveTo(cx - scale * 0.33, height * 1.08);
    ctx.lineTo(cx - scale * 0.27, headY + headH * 1.2);
    ctx.quadraticCurveTo(cx - scale * 0.18, headY + headH * 0.9, cx - scale * 0.09, headY + headH * 0.9);
    ctx.lineTo(cx + scale * 0.09, headY + headH * 0.9);
    ctx.quadraticCurveTo(cx + scale * 0.2, headY + headH * 0.9, cx + scale * 0.29, headY + headH * 1.22);
    ctx.lineTo(cx + scale * 0.35, height * 1.08);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = mix(jacket, v.subject, 0.22);
    ctx.beginPath();
    ctx.moveTo(cx - scale * 0.1, headY + headH * 1.08);
    ctx.lineTo(cx, headY + headH * 1.43);
    ctx.lineTo(cx + scale * 0.1, headY + headH * 1.08);
    ctx.lineTo(cx + scale * 0.035, headY + headH * 1.0);
    ctx.lineTo(cx - scale * 0.035, headY + headH * 1.0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.22, headY + headH * 0.62);
    ctx.lineTo(cx + headW * 0.22, headY + headH * 0.62);
    ctx.lineTo(cx + headW * 0.19, headY + headH * 1.02);
    ctx.quadraticCurveTo(cx, headY + headH * 1.12, cx - headW * 0.19, headY + headH * 1.02);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, headY, headW * 0.5, headH * 0.5, 0, 0, Math.PI * 2);
    const skinShade = ctx.createLinearGradient(cx - headW * 0.5, headY, cx + headW * 0.5, headY);
    skinShade.addColorStop(0, mix(skin, "#704535", 0.2));
    skinShade.addColorStop(0.36, mix(skin, "#ffffff", 0.16));
    skinShade.addColorStop(0.72, skin);
    skinShade.addColorStop(1, mix(skin, "#704535", 0.14));
    ctx.fillStyle = skinShade;
    ctx.fill();

    ctx.fillStyle = mix(skin, "#ffffff", 0.18);
    ctx.beginPath();
    ctx.ellipse(cx - headW * 0.09, headY - headH * 0.04, headW * 0.3, headH * 0.37, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = mix(skin, v.accent, 0.12);
    ctx.beginPath();
    ctx.ellipse(cx - headW * 0.24, headY + headH * 0.2, headW * 0.12, headH * 0.055, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + headW * 0.24, headY + headH * 0.2, headW * 0.12, headH * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();

    const hairShade = ctx.createLinearGradient(cx - headW * 0.55, headY, cx + headW * 0.55, headY);
    hairShade.addColorStop(0, mix(hair, "#000000", 0.28));
    hairShade.addColorStop(0.42, mix(hair, v.accent, 0.12));
    hairShade.addColorStop(0.7, hair);
    hairShade.addColorStop(1, mix(hair, "#000000", 0.18));
    ctx.fillStyle = hairShade;
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.52, headY + headH * 0.14);
    ctx.quadraticCurveTo(cx - headW * 0.62, headY - headH * 0.64, cx + headW * 0.08, headY - headH * 0.58);
    ctx.quadraticCurveTo(cx + headW * 0.65, headY - headH * 0.48, cx + headW * 0.52, headY + headH * 0.3);
    ctx.quadraticCurveTo(cx + headW * 0.31, headY + headH * 0.08, cx + headW * 0.18, headY - headH * 0.1);
    ctx.quadraticCurveTo(cx - headW * 0.04, headY + headH * 0.14, cx - headW * 0.52, headY + headH * 0.14);
    ctx.fill();

    ctx.fillStyle = mix(hair, v.accent, 0.24);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.47, headY + headH * 0.12);
    ctx.quadraticCurveTo(cx - headW * 0.34, headY + headH * 0.66, cx - headW * 0.4, headY + headH * 0.82);
    ctx.lineTo(cx - headW * 0.25, headY + headH * 0.9);
    ctx.quadraticCurveTo(cx - headW * 0.23, headY + headH * 0.55, cx - headW * 0.22, headY + headH * 0.18);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.52, headY + headH * 0.14);
    ctx.quadraticCurveTo(cx - headW * 0.62, headY - headH * 0.64, cx + headW * 0.08, headY - headH * 0.58);
    ctx.quadraticCurveTo(cx + headW * 0.65, headY - headH * 0.48, cx + headW * 0.52, headY + headH * 0.3);
    ctx.quadraticCurveTo(cx + headW * 0.31, headY + headH * 0.08, cx + headW * 0.18, headY - headH * 0.1);
    ctx.quadraticCurveTo(cx - headW * 0.04, headY + headH * 0.14, cx - headW * 0.52, headY + headH * 0.14);
    ctx.clip();
    ctx.strokeStyle = rgba(mix(hair, "#ffffff", 0.22), 0.2);
    ctx.lineWidth = Math.max(1, scale * 0.0012);
    for (let strand = 0; strand < 7; strand += 1) {
        const x = cx - headW * 0.4 + ((strand + random() * 0.55) / 6) * headW * 0.8;
        const wave = (random() - 0.5) * headW * 0.12;
        ctx.beginPath();
        ctx.moveTo(x, headY - headH * 0.48);
        ctx.bezierCurveTo(
            x + wave,
            headY - headH * 0.25,
            x - wave,
            headY - headH * 0.02,
            x + wave * 0.4,
            headY + headH * 0.16
        );
        ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = mix(hair, "#ffffff", 0.25);
    ctx.lineWidth = Math.max(1.5, scale * 0.005);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.28, headY - headH * 0.33);
    ctx.quadraticCurveTo(cx - headW * 0.02, headY - headH * 0.48, cx + headW * 0.27, headY - headH * 0.25);
    ctx.moveTo(cx - headW * 0.39, headY - headH * 0.16);
    ctx.quadraticCurveTo(cx - headW * 0.1, headY - headH * 0.33, cx + headW * 0.17, headY - headH * 0.15);
    ctx.stroke();

    const eyeY = headY + headH * 0.08;
    for (const side of [-1, 1]) {
        const eyeX = cx + side * headW * 0.2;
            ctx.strokeStyle = mix(hair, "#000000", 0.15);
        ctx.lineWidth = Math.max(1.5, scale * 0.006);
        ctx.beginPath();
        ctx.moveTo(eyeX - headW * 0.07, eyeY - headH * 0.04);
        ctx.quadraticCurveTo(eyeX, eyeY - headH * 0.1, eyeX + headW * 0.07, eyeY - headH * 0.035);
        ctx.stroke();
        ctx.fillStyle = "#1a1820";
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY, headW * 0.035, headH * 0.022, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = mix(v.accent, "#ffffff", 0.25);
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, headW * 0.014, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(eyeX - headW * 0.012, eyeY - headH * 0.009, headW * 0.009, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = rgba("#553b38", 0.65);
    ctx.lineWidth = Math.max(1, scale * 0.003);
    ctx.beginPath();
    ctx.moveTo(cx, eyeY + headH * 0.015);
    ctx.lineTo(cx - headW * 0.025, eyeY + headH * 0.16);
    ctx.quadraticCurveTo(cx + headW * 0.02, eyeY + headH * 0.18, cx + headW * 0.045, eyeY + headH * 0.15);
    ctx.stroke();

    ctx.strokeStyle = rgba(v.subject, 0.44);
    ctx.lineWidth = Math.max(1, scale * 0.003);
    ctx.beginPath();
    ctx.moveTo(cx - scale * 0.25, height * 0.79);
    ctx.quadraticCurveTo(cx - scale * 0.15, height * 0.75, cx - scale * 0.08, height * 0.78);
    ctx.moveTo(cx + scale * 0.25, height * 0.79);
    ctx.quadraticCurveTo(cx + scale * 0.15, height * 0.75, cx + scale * 0.08, height * 0.78);
    ctx.moveTo(cx - scale * 0.18, height * 0.91);
    ctx.lineTo(cx - scale * 0.11, height * 0.94);
    ctx.moveTo(cx + scale * 0.18, height * 0.91);
    ctx.lineTo(cx + scale * 0.11, height * 0.94);
    ctx.stroke();

    ctx.strokeStyle = mix(v.accent, "#ffffff", 0.35);
    ctx.lineWidth = Math.max(1.5, scale * 0.004);
    ctx.beginPath();
    ctx.moveTo(cx - headW * 0.07, headY + headH * 0.31);
    ctx.quadraticCurveTo(cx, headY + headH * 0.37, cx + headW * 0.07, headY + headH * 0.3);
    ctx.stroke();

    ctx.fillStyle = rgba(v.accent, 0.75);
    for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(cx + (i - 1.5) * scale * 0.017, headY + headH * 0.22 + (i % 2) * scale * 0.012, scale * 0.003, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = rgba(v.accent, 0.9);
    ctx.lineWidth = Math.max(1, scale * 0.004);
    ctx.beginPath();
    ctx.moveTo(cx - scale * 0.12, headY + headH * 1.43);
    ctx.lineTo(cx, headY + headH * 1.76);
    ctx.lineTo(cx + scale * 0.12, headY + headH * 1.43);
    ctx.stroke();
    ctx.fillStyle = v.accent;
    ctx.beginPath();
    ctx.arc(cx, headY + headH * 1.78, scale * 0.016, 0, Math.PI * 2);
    ctx.fill();

    addVignette(ctx, width, height, 0.35);
    addGrain(ctx, width, height, random, 0.006);
}

function drawStreetwear(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    const horizon = height * 0.67;
    radialBlob(ctx, width * 0.5, horizon * 0.65, width * 0.34, v.glow, 0.35);

    ctx.fillStyle = rgba(v.accent, 0.1);
    for (let i = 0; i < 8; i += 1) {
        const x = width * (i / 7);
        const h = height * range(random, 0.18, 0.5);
        ctx.fillRect(x, horizon - h, width * 0.09, h);
        for (let wy = horizon - h + height * 0.04; wy < horizon - height * 0.025; wy += height * 0.055) {
            ctx.fillStyle = rgba(v.glow, 0.2);
            ctx.fillRect(x + width * 0.018, wy, width * 0.012, height * 0.018);
            ctx.fillStyle = rgba(v.accent, 0.1);
        }
    }

    ctx.fillStyle = mix(v.dark, "#000000", 0.3);
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = rgba(v.subject, 0.25);
    ctx.lineWidth = Math.max(2, width * 0.002);
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();
    for (let i = 0; i < 12; i += 1) {
        const x = random() * width;
        ctx.fillStyle = rgba(v.glow, random() * 0.35);
        ctx.beginPath();
        ctx.ellipse(x, horizon + height * 0.05, width * range(random, 0.008, 0.04), height * 0.008, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    const cx = width * range(random, 0.43, 0.57);
    const unit = Math.min(width, height);
    const head = unit * 0.13;
    const headY = height * 0.31;
    const skin = pick(random, ["#f1c7a5", "#d99a72", "#a9684e", "#754a3b", "#e7b994"]);
    const outfit = mix(v.subject, v.dark, 0.3);
    const pants = mix(v.dark, v.accent, 0.12);

    ctx.fillStyle = "#101018";
    ctx.beginPath();
    ctx.ellipse(cx, horizon + height * 0.015, unit * 0.25, height * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pants;
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.14, height * 0.58);
    ctx.lineTo(cx + unit * 0.14, height * 0.58);
    ctx.lineTo(cx + unit * 0.12, horizon);
    ctx.lineTo(cx + unit * 0.015, horizon);
    ctx.lineTo(cx, height * 0.72);
    ctx.lineTo(cx - unit * 0.045, horizon);
    ctx.lineTo(cx - unit * 0.16, horizon);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(v.subject, 0.45);
    ctx.lineWidth = Math.max(1.5, unit * 0.005);
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.1, height * 0.64);
    ctx.lineTo(cx - unit * 0.04, height * 0.82);
    ctx.moveTo(cx + unit * 0.1, height * 0.64);
    ctx.lineTo(cx + unit * 0.075, height * 0.88);
    ctx.stroke();

    ctx.fillStyle = "#09090d";
    ctx.beginPath();
    ctx.ellipse(cx - unit * 0.1, horizon, unit * 0.08, unit * 0.025, -0.08, 0, Math.PI * 2);
    ctx.ellipse(cx + unit * 0.09, horizon, unit * 0.08, unit * 0.025, 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = outfit;
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.16, height * 0.39);
    ctx.quadraticCurveTo(cx - unit * 0.22, height * 0.43, cx - unit * 0.2, height * 0.55);
    ctx.lineTo(cx - unit * 0.15, height * 0.64);
    ctx.lineTo(cx + unit * 0.15, height * 0.64);
    ctx.lineTo(cx + unit * 0.2, height * 0.55);
    ctx.quadraticCurveTo(cx + unit * 0.22, height * 0.43, cx + unit * 0.16, height * 0.39);
    ctx.lineTo(cx + unit * 0.09, height * 0.36);
    ctx.lineTo(cx - unit * 0.09, height * 0.36);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = mix(outfit, v.dark, 0.22);
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.14, height * 0.42);
    ctx.quadraticCurveTo(cx - unit * 0.2, height * 0.43, cx - unit * 0.2, height * 0.52);
    ctx.lineTo(cx - unit * 0.13, height * 0.6);
    ctx.lineTo(cx - unit * 0.1, height * 0.57);
    ctx.lineTo(cx - unit * 0.12, height * 0.49);
    ctx.lineTo(cx - unit * 0.06, height * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + unit * 0.14, height * 0.42);
    ctx.quadraticCurveTo(cx + unit * 0.2, height * 0.43, cx + unit * 0.2, height * 0.52);
    ctx.lineTo(cx + unit * 0.13, height * 0.6);
    ctx.lineTo(cx + unit * 0.1, height * 0.57);
    ctx.lineTo(cx + unit * 0.12, height * 0.49);
    ctx.lineTo(cx + unit * 0.06, height * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(v.accent, 0.8);
    ctx.fillRect(cx - unit * 0.13, height * 0.57, unit * 0.045, height * 0.018);
    ctx.fillRect(cx + unit * 0.085, height * 0.57, unit * 0.045, height * 0.018);

    ctx.fillStyle = mix(outfit, v.accent, 0.3);
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.08, height * 0.37);
    ctx.lineTo(cx, height * 0.48);
    ctx.lineTo(cx + unit * 0.08, height * 0.37);
    ctx.lineTo(cx + unit * 0.05, height * 0.35);
    ctx.lineTo(cx - unit * 0.05, height * 0.35);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(v.glow, 0.7);
    ctx.lineWidth = Math.max(1, unit * 0.003);
    ctx.beginPath();
    ctx.moveTo(cx, height * 0.46);
    ctx.lineTo(cx, height * 0.62);
    ctx.moveTo(cx - unit * 0.09, height * 0.43);
    ctx.lineTo(cx - unit * 0.04, height * 0.47);
    ctx.moveTo(cx + unit * 0.09, height * 0.43);
    ctx.lineTo(cx + unit * 0.04, height * 0.47);
    ctx.stroke();
    ctx.strokeStyle = v.accent;
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.11, height * 0.53);
    ctx.lineTo(cx - unit * 0.02, height * 0.53);
    ctx.stroke();

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.035, headY + head * 0.55);
    ctx.lineTo(cx + unit * 0.035, headY + head * 0.55);
    ctx.lineTo(cx + unit * 0.03, headY + head * 0.72);
    ctx.quadraticCurveTo(cx, headY + head * 0.77, cx - unit * 0.03, headY + head * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, headY, head * 0.47, head * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + side * head * 0.46, headY + head * 0.12, head * 0.07, head * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    const hair = pick(random, ["#17131b", "#39251e", "#76503b", "#d2a35f"]);
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, headY - head * 0.08, head * 0.5, Math.PI, Math.PI * 2);
    ctx.lineTo(cx + head * 0.46, headY + head * 0.2);
    ctx.quadraticCurveTo(cx + head * 0.2, headY + head * 0.02, cx - head * 0.44, headY + head * 0.22);
    ctx.closePath();
    ctx.fill();
    for (const side of [-1, 1]) {
        const eyeX = cx + side * head * 0.17;
        ctx.fillStyle = "#f3e7dd";
        ctx.beginPath();
        ctx.ellipse(eyeX, headY + head * 0.035, head * 0.065, head * 0.038, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#241b1b";
        ctx.beginPath();
        ctx.arc(eyeX, headY + head * 0.035, head * 0.023, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(hair, 0.9);
        ctx.lineWidth = Math.max(1.5, unit * 0.004);
        ctx.beginPath();
        ctx.moveTo(eyeX - head * 0.075, headY - head * 0.035);
        ctx.lineTo(eyeX + head * 0.065, headY - head * 0.055);
        ctx.stroke();
    }
    ctx.strokeStyle = rgba("#744c43", 0.8);
    ctx.lineWidth = Math.max(1, unit * 0.003);
    ctx.beginPath();
    ctx.moveTo(cx, headY + head * 0.05);
    ctx.lineTo(cx - head * 0.02, headY + head * 0.18);
    ctx.quadraticCurveTo(cx, headY + head * 0.2, cx + head * 0.035, headY + head * 0.17);
    ctx.moveTo(cx - head * 0.08, headY + head * 0.29);
    ctx.quadraticCurveTo(cx, headY + head * 0.33, cx + head * 0.08, headY + head * 0.28);
    ctx.stroke();
    ctx.fillStyle = v.accent;
    ctx.beginPath();
    ctx.arc(cx - head * 0.23, headY + head * 0.18, unit * 0.012, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(v.glow, 0.45);
    ctx.beginPath();
    ctx.ellipse(cx - head * 0.23, headY + head * 0.19, head * 0.09, head * 0.045, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + head * 0.23, headY + head * 0.19, head * 0.09, head * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();

    addVignette(ctx, width, height, 0.48);
    addGrain(ctx, width, height, random, 0.008);
}

function drawCar(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    const horizon = height * 0.68;
    radialBlob(ctx, width * 0.52, horizon * 0.58, width * 0.4, v.glow, 0.28);

    for (let i = 0; i < 7; i += 1) {
        const x = i * width * 0.16 - width * 0.03;
        const bH = height * range(random, 0.17, 0.44);
        ctx.fillStyle = mix(v.dark, v.sky[1], 0.35);
        ctx.fillRect(x, horizon - bH, width * 0.1, bH);
        for (let wy = horizon - bH + height * 0.035; wy < horizon - height * 0.025; wy += height * 0.055) {
            ctx.fillStyle = rgba(v.accent, random() * 0.65 + 0.12);
            ctx.fillRect(x + width * 0.02, wy, width * 0.012, height * 0.018);
            ctx.fillRect(x + width * 0.065, wy, width * 0.012, height * 0.018);
        }
    }
    ctx.fillStyle = mix(v.dark, "#000000", 0.36);
    ctx.fillRect(0, horizon, width, height - horizon);
    ctx.strokeStyle = rgba(v.subject, 0.3);
    ctx.lineWidth = Math.max(2, width * 0.002);
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();
    ctx.setLineDash([width * 0.035, width * 0.025]);
    ctx.lineWidth = Math.max(2, width * 0.003);
    ctx.strokeStyle = rgba(v.glow, 0.45);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.94);
    ctx.lineTo(width, height * 0.94);
    ctx.stroke();
    ctx.setLineDash([]);

    const cx = width * range(random, 0.46, 0.54);
    const baseY = height * 0.82;
    const carW = width * 0.64;
    const carH = height * 0.34;
    const body = mix(v.subject, v.accent, 0.25);

    ctx.fillStyle = rgba(v.accent, 0.18);
    ctx.beginPath();
    ctx.ellipse(cx, baseY + carH * 0.18, carW * 0.58, carH * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    for (const wx of [cx - carW * 0.31, cx + carW * 0.29]) {
        ctx.fillStyle = "#090a10";
        ctx.beginPath();
        ctx.arc(wx, baseY + carH * 0.11, carH * 0.23, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#343843";
        ctx.beginPath();
        ctx.arc(wx, baseY + carH * 0.11, carH * 0.145, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(v.subject, 0.8);
        ctx.lineWidth = Math.max(1.5, carH * 0.018);
        ctx.beginPath();
        ctx.arc(wx, baseY + carH * 0.11, carH * 0.09, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgba(v.accent, 0.75);
        for (let spoke = 0; spoke < 8; spoke += 1) {
            const a = (spoke / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(wx, baseY + carH * 0.11);
            ctx.lineTo(wx + Math.cos(a) * carH * 0.12, baseY + carH * 0.11 + Math.sin(a) * carH * 0.12);
            ctx.stroke();
        }
        ctx.fillStyle = "#12141b";
        ctx.beginPath();
        ctx.arc(wx, baseY + carH * 0.11, carH * 0.035, 0, Math.PI * 2);
        ctx.fill();
    }

    const bodyShade = ctx.createLinearGradient(cx, baseY - carH, cx, baseY + carH * 0.1);
    bodyShade.addColorStop(0, mix(body, "#ffffff", 0.28));
    bodyShade.addColorStop(0.42, body);
    bodyShade.addColorStop(1, mix(body, v.dark, 0.42));
    ctx.fillStyle = bodyShade;
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.52, baseY);
    ctx.quadraticCurveTo(cx - carW * 0.5, baseY - carH * 0.32, cx - carW * 0.37, baseY - carH * 0.4);
    ctx.lineTo(cx - carW * 0.18, baseY - carH * 0.84);
    ctx.quadraticCurveTo(cx - carW * 0.1, baseY - carH * 0.97, cx + carW * 0.13, baseY - carH * 0.92);
    ctx.lineTo(cx + carW * 0.32, baseY - carH * 0.43);
    ctx.quadraticCurveTo(cx + carW * 0.48, baseY - carH * 0.36, cx + carW * 0.52, baseY - carH * 0.12);
    ctx.lineTo(cx + carW * 0.5, baseY + carH * 0.06);
    ctx.lineTo(cx - carW * 0.5, baseY + carH * 0.06);
    ctx.closePath();
    ctx.fill();

    const glass = mix(v.sky[1], "#131e32", 0.4);
    const glassShade = ctx.createLinearGradient(cx, baseY - carH * 0.9, cx, baseY - carH * 0.4);
    glassShade.addColorStop(0, mix(glass, v.glow, 0.24));
    glassShade.addColorStop(1, mix(glass, v.dark, 0.38));
    ctx.fillStyle = glassShade;
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.13, baseY - carH * 0.78);
    ctx.quadraticCurveTo(cx - carW * 0.07, baseY - carH * 0.88, cx + carW * 0.1, baseY - carH * 0.83);
    ctx.lineTo(cx + carW * 0.24, baseY - carH * 0.46);
    ctx.lineTo(cx - carW * 0.28, baseY - carH * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(v.subject, 0.58);
    ctx.lineWidth = Math.max(1.5, carH * 0.016);
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.04, baseY - carH * 0.83);
    ctx.lineTo(cx - carW * 0.015, baseY - carH * 0.45);
    ctx.moveTo(cx + carW * 0.15, baseY - carH * 0.47);
    ctx.lineTo(cx + carW * 0.26, baseY - carH * 0.35);
    ctx.stroke();

    ctx.strokeStyle = rgba("#ffffff", 0.55);
    ctx.lineWidth = Math.max(2, carH * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.38, baseY - carH * 0.31);
    ctx.quadraticCurveTo(cx, baseY - carH * 0.23, cx + carW * 0.38, baseY - carH * 0.3);
    ctx.stroke();
    ctx.strokeStyle = rgba(v.dark, 0.65);
    ctx.lineWidth = Math.max(1, carH * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.07, baseY - carH * 0.4);
    ctx.lineTo(cx - carW * 0.09, baseY - carH * 0.1);
    ctx.moveTo(cx + carW * 0.25, baseY - carH * 0.4);
    ctx.lineTo(cx + carW * 0.26, baseY - carH * 0.1);
    ctx.moveTo(cx - carW * 0.28, baseY - carH * 0.15);
    ctx.lineTo(cx + carW * 0.3, baseY - carH * 0.15);
    ctx.stroke();

    ctx.strokeStyle = rgba("#ffffff", 0.32);
    ctx.lineWidth = Math.max(2, carH * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx - carW * 0.24, baseY - carH * 0.39);
    ctx.quadraticCurveTo(cx - carW * 0.02, baseY - carH * 0.34, cx + carW * 0.2, baseY - carH * 0.4);
    ctx.stroke();
    ctx.fillStyle = rgba(v.dark, 0.78);
    ctx.beginPath();
    ctx.roundRect(cx + carW * 0.02, baseY - carH * 0.14, carW * 0.07, carH * 0.025, carH * 0.01);
    ctx.fill();

    ctx.fillStyle = "#fff4d0";
    ctx.shadowColor = v.glow;
    ctx.shadowBlur = carH * 0.12;
    ctx.beginPath();
    ctx.ellipse(cx + carW * 0.45, baseY - carH * 0.26, carW * 0.035, carH * 0.055, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ff344f";
    ctx.fillRect(cx - carW * 0.5, baseY - carH * 0.25, carW * 0.055, carH * 0.045);
    ctx.fillStyle = rgba(v.subject, 0.7);
    ctx.fillRect(cx - carW * 0.16, baseY - carH * 0.18, carW * 0.2, carH * 0.025);

    addGrain(ctx, width, height, random, 0.006);
    addVignette(ctx, width, height, 0.44);
}

function drawMotorcycle(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.5, height * 0.53, width * 0.42, v.glow, 0.28);
    const horizon = height * 0.72;
    ctx.fillStyle = mix(v.dark, "#000000", 0.28);
    ctx.fillRect(0, horizon, width, height - horizon);
    for (let i = 0; i < 10; i += 1) {
        const x = random() * width;
        ctx.fillStyle = rgba(v.accent, random() * 0.45);
        ctx.beginPath();
        ctx.arc(x, height * range(random, 0.15, 0.62), width * range(random, 0.002, 0.008), 0, Math.PI * 2);
        ctx.fill();
    }

    const cx = width * 0.5;
    const y = height * 0.7;
    const unit = Math.min(width, height);
    const wheelR = unit * 0.16;
    const left = cx - width * 0.22;
    const right = cx + width * 0.22;
    const wheelY = y + wheelR * 0.28;

    for (const x of [left, right]) {
        ctx.fillStyle = "#07080d";
        ctx.beginPath();
        ctx.arc(x, wheelY, wheelR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(v.subject, 0.7);
        ctx.lineWidth = Math.max(2, unit * 0.012);
        ctx.beginPath();
        ctx.arc(x, wheelY, wheelR * 0.78, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgba(v.glow, 0.55);
        ctx.lineWidth = Math.max(1, unit * 0.004);
        for (let i = 0; i < 12; i += 1) {
            const a = (i / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, wheelY);
            ctx.lineTo(x + Math.cos(a) * wheelR * 0.75, wheelY + Math.sin(a) * wheelR * 0.75);
            ctx.stroke();
        }
        ctx.fillStyle = "#242833";
        ctx.beginPath();
        ctx.arc(x, wheelY, wheelR * 0.14, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.strokeStyle = mix(v.subject, v.accent, 0.25);
    ctx.lineWidth = Math.max(5, unit * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(left, wheelY);
    ctx.lineTo(cx - unit * 0.02, y - unit * 0.02);
    ctx.lineTo(right, wheelY);
    ctx.lineTo(cx + unit * 0.02, y - unit * 0.02);
    ctx.lineTo(left, wheelY);
    ctx.moveTo(cx - unit * 0.02, y - unit * 0.02);
    ctx.lineTo(cx + unit * 0.16, y + unit * 0.02);
    ctx.stroke();

    ctx.fillStyle = mix(v.subject, v.accent, 0.5);
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.12, y - unit * 0.16);
    ctx.quadraticCurveTo(cx - unit * 0.02, y - unit * 0.24, cx + unit * 0.12, y - unit * 0.15);
    ctx.lineTo(cx + unit * 0.18, y - unit * 0.03);
    ctx.quadraticCurveTo(cx + unit * 0.02, y + unit * 0.02, cx - unit * 0.1, y - unit * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#11131a";
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.15, y - unit * 0.2);
    ctx.quadraticCurveTo(cx - unit * 0.03, y - unit * 0.27, cx + unit * 0.09, y - unit * 0.2);
    ctx.lineTo(cx + unit * 0.02, y - unit * 0.15);
    ctx.lineTo(cx - unit * 0.15, y - unit * 0.15);
    ctx.fill();

    ctx.strokeStyle = rgba(v.subject, 0.9);
    ctx.lineWidth = Math.max(3, unit * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx + unit * 0.04, y - unit * 0.15);
    ctx.lineTo(cx + unit * 0.2, y - unit * 0.27);
    ctx.lineTo(cx + unit * 0.24, y - unit * 0.2);
    ctx.moveTo(cx + unit * 0.2, y - unit * 0.27);
    ctx.lineTo(cx + unit * 0.27, y - unit * 0.27);
    ctx.stroke();
    ctx.fillStyle = "#f9e8c2";
    ctx.beginPath();
    ctx.arc(cx + unit * 0.18, y - unit * 0.15, unit * 0.035, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(v.glow, 0.9);
    ctx.lineWidth = Math.max(2, unit * 0.008);
    ctx.beginPath();
    ctx.moveTo(cx - unit * 0.08, y - unit * 0.18);
    ctx.lineTo(cx - unit * 0.18, y - unit * 0.27);
    ctx.moveTo(cx + unit * 0.02, y - unit * 0.2);
    ctx.lineTo(cx + unit * 0.14, y - unit * 0.25);
    ctx.stroke();

    addVignette(ctx, width, height, 0.42);
    addGrain(ctx, width, height, random, 0.006);
}

function drawBicycle(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.5, height * 0.34, width * 0.4, v.glow, 0.25);
    for (let i = 0; i < 8; i += 1) {
        const x = width * i / 7;
        const h = height * range(random, 0.22, 0.56);
        pineTree(ctx, x, height * 0.75, h, width * 0.12, rgba(mix(v.dark, v.subject, 0.2), 0.8));
    }
    ctx.fillStyle = mix(v.dark, "#000000", 0.3);
    ctx.fillRect(0, height * 0.74, width, height * 0.26);

    const cx = width * 0.5;
    const y = height * 0.66;
    const unit = Math.min(width, height);
    const r = unit * 0.19;
    const left = cx - width * 0.24;
    const right = cx + width * 0.24;
    const top = y - r * 0.65;

    for (const x of [left, right]) {
        ctx.strokeStyle = "#11151b";
        ctx.lineWidth = Math.max(4, unit * 0.018);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rgba(v.subject, 0.65);
        ctx.lineWidth = Math.max(1, unit * 0.004);
        for (let i = 0; i < 20; i += 1) {
            const a = (i / 20) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
            ctx.stroke();
        }
        ctx.fillStyle = v.accent;
        ctx.beginPath();
        ctx.arc(x, y, unit * 0.018, 0, Math.PI * 2);
        ctx.fill();
    }

    const crank = { x: cx + width * 0.035, y: y - unit * 0.045 };
    const seat = { x: cx - width * 0.055, y: top - unit * 0.16 };
    const handle = { x: cx + width * 0.12, y: top - unit * 0.08 };
    ctx.strokeStyle = mix(v.subject, v.accent, 0.25);
    ctx.lineWidth = Math.max(4, unit * 0.025);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(seat.x, seat.y);
    ctx.lineTo(crank.x, crank.y);
    ctx.lineTo(left, y);
    ctx.moveTo(crank.x, crank.y);
    ctx.lineTo(handle.x, handle.y);
    ctx.lineTo(right, y);
    ctx.lineTo(crank.x, crank.y);
    ctx.stroke();

    ctx.strokeStyle = rgba(v.subject, 0.9);
    ctx.lineWidth = Math.max(3, unit * 0.016);
    ctx.beginPath();
    ctx.moveTo(seat.x - unit * 0.06, seat.y);
    ctx.lineTo(seat.x + unit * 0.04, seat.y);
    ctx.moveTo(seat.x, seat.y);
    ctx.lineTo(seat.x, seat.y - unit * 0.07);
    ctx.moveTo(handle.x - unit * 0.04, handle.y - unit * 0.015);
    ctx.lineTo(handle.x + unit * 0.07, handle.y - unit * 0.015);
    ctx.moveTo(handle.x, handle.y);
    ctx.lineTo(handle.x, handle.y - unit * 0.075);
    ctx.stroke();

    ctx.strokeStyle = v.accent;
    ctx.lineWidth = Math.max(2, unit * 0.009);
    ctx.beginPath();
    ctx.arc(crank.x, crank.y, unit * 0.055, 0, Math.PI * 2);
    ctx.moveTo(crank.x, crank.y);
    ctx.lineTo(crank.x + unit * 0.05, crank.y + unit * 0.035);
    ctx.moveTo(crank.x, crank.y);
    ctx.lineTo(crank.x - unit * 0.04, crank.y - unit * 0.04);
    ctx.stroke();
    ctx.strokeStyle = rgba("#d5b77a", 0.8);
    ctx.beginPath();
    ctx.moveTo(crank.x + unit * 0.055, crank.y);
    ctx.lineTo(right - unit * 0.02, y);
    ctx.lineTo(crank.x - unit * 0.055, crank.y);
    ctx.stroke();

    addVignette(ctx, width, height, 0.42);
}

function drawSneaker(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.52, height * 0.52, width * 0.46, v.glow, 0.38);
    const cx = width * 0.5;
    const cy = height * 0.61;
    const unit = Math.min(width, height);
    const shoeW = width * 0.62;
    const shoeH = height * 0.31;
    const sole = mix(v.subject, "#ffffff", 0.72);
    const upper = mix(v.subject, v.accent, 0.36);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.035);

    ctx.fillStyle = rgba("#000000", 0.38);
    ctx.beginPath();
    ctx.ellipse(0, shoeH * 0.72, shoeW * 0.55, shoeH * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = sole;
    ctx.beginPath();
    ctx.moveTo(-shoeW * 0.52, shoeH * 0.43);
    ctx.quadraticCurveTo(-shoeW * 0.47, shoeH * 0.62, -shoeW * 0.26, shoeH * 0.64);
    ctx.lineTo(shoeW * 0.4, shoeH * 0.64);
    ctx.quadraticCurveTo(shoeW * 0.56, shoeH * 0.61, shoeW * 0.52, shoeH * 0.48);
    ctx.lineTo(shoeW * 0.49, shoeH * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(v.dark, 0.5);
    ctx.lineWidth = Math.max(1.5, unit * 0.008);
    ctx.beginPath();
    ctx.moveTo(-shoeW * 0.49, shoeH * 0.53);
    ctx.quadraticCurveTo(0, shoeH * 0.61, shoeW * 0.5, shoeH * 0.5);
    ctx.stroke();

    ctx.fillStyle = upper;
    ctx.beginPath();
    ctx.moveTo(-shoeW * 0.5, shoeH * 0.43);
    ctx.quadraticCurveTo(-shoeW * 0.4, shoeH * 0.27, -shoeW * 0.22, shoeH * 0.21);
    ctx.lineTo(-shoeW * 0.02, -shoeH * 0.22);
    ctx.quadraticCurveTo(shoeW * 0.04, -shoeH * 0.29, shoeW * 0.13, -shoeH * 0.19);
    ctx.lineTo(shoeW * 0.31, shoeH * 0.13);
    ctx.quadraticCurveTo(shoeW * 0.39, shoeH * 0.24, shoeW * 0.51, shoeH * 0.33);
    ctx.lineTo(shoeW * 0.52, shoeH * 0.45);
    ctx.quadraticCurveTo(0, shoeH * 0.55, -shoeW * 0.5, shoeH * 0.43);
    ctx.fill();

    ctx.fillStyle = mix(upper, v.dark, 0.25);
    ctx.beginPath();
    ctx.moveTo(-shoeW * 0.19, shoeH * 0.24);
    ctx.lineTo(-shoeW * 0.03, -shoeH * 0.17);
    ctx.quadraticCurveTo(shoeW * 0.02, -shoeH * 0.23, shoeW * 0.09, -shoeH * 0.15);
    ctx.lineTo(shoeW * 0.22, shoeH * 0.15);
    ctx.lineTo(shoeW * 0.15, shoeH * 0.38);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba("#ffffff", 0.85);
    ctx.lineWidth = Math.max(2, unit * 0.012);
    for (let i = 0; i < 5; i += 1) {
        const yy = -shoeH * 0.12 + i * shoeH * 0.075;
        ctx.beginPath();
        ctx.moveTo(-shoeW * 0.035, yy);
        ctx.lineTo(shoeW * 0.115, yy + shoeH * 0.035);
        ctx.stroke();
        ctx.fillStyle = v.accent;
        ctx.beginPath();
        ctx.arc(-shoeW * 0.04, yy, unit * 0.006, 0, Math.PI * 2);
        ctx.arc(shoeW * 0.12, yy + shoeH * 0.035, unit * 0.006, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = rgba(v.subject, 0.8);
    ctx.lineWidth = Math.max(1, unit * 0.004);
    ctx.beginPath();
    ctx.moveTo(-shoeW * 0.42, shoeH * 0.38);
    ctx.quadraticCurveTo(-shoeW * 0.28, shoeH * 0.22, -shoeW * 0.1, shoeH * 0.27);
    ctx.moveTo(shoeW * 0.22, shoeH * 0.2);
    ctx.quadraticCurveTo(shoeW * 0.34, shoeH * 0.34, shoeW * 0.46, shoeH * 0.37);
    ctx.stroke();

    ctx.restore();
    addVignette(ctx, width, height, 0.4);
}

function drawCamera(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.5, height * 0.44, width * 0.48, v.glow, 0.35);
    const cx = width * 0.5;
    const cy = height * 0.54;
    const unit = Math.min(width, height);
    const bodyW = width * 0.56;
    const bodyH = height * 0.42;
    const body = mix(v.subject, v.dark, 0.3);

    ctx.fillStyle = rgba("#000000", 0.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy + bodyH * 0.72, bodyW * 0.58, bodyH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(cx - bodyW * 0.5, cy - bodyH * 0.4, bodyW, bodyH * 0.8, unit * 0.045);
    ctx.fill();
    ctx.strokeStyle = rgba(v.subject, 0.65);
    ctx.lineWidth = Math.max(2, unit * 0.01);
    ctx.stroke();

    ctx.fillStyle = mix(body, v.dark, 0.4);
    ctx.beginPath();
    ctx.roundRect(cx - bodyW * 0.28, cy - bodyH * 0.58, bodyW * 0.34, bodyH * 0.2, unit * 0.025);
    ctx.fill();
    ctx.fillStyle = v.accent;
    ctx.beginPath();
    ctx.roundRect(cx + bodyW * 0.28, cy - bodyH * 0.32, bodyW * 0.08, bodyH * 0.08, unit * 0.015);
    ctx.fill();
    ctx.fillStyle = rgba(v.glow, 0.9);
    ctx.beginPath();
    ctx.roundRect(cx - bodyW * 0.35, cy - bodyH * 0.3, bodyW * 0.1, bodyH * 0.08, unit * 0.015);
    ctx.fill();

    const lensX = cx + bodyW * 0.05;
    const lensR = bodyH * 0.38;
    for (let ring = 3; ring >= 0; ring -= 1) {
        const r = lensR * (0.45 + ring * 0.18);
        ctx.fillStyle = [v.dark, "#19202b", "#394557", "#202a3a"][ring];
        ctx.beginPath();
        ctx.arc(lensX, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(v.subject, 0.5 + ring * 0.1);
        ctx.lineWidth = Math.max(1.5, unit * 0.008);
        ctx.stroke();
    }
    ctx.fillStyle = mix(v.sky[1], v.accent, 0.5);
    ctx.beginPath();
    ctx.arc(lensX, cy, lensR * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba("#ffffff", 0.8);
    ctx.beginPath();
    ctx.ellipse(lensX - lensR * 0.14, cy - lensR * 0.17, lensR * 0.11, lensR * 0.06, -0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(v.accent, 0.88);
    ctx.lineWidth = Math.max(1.5, unit * 0.006);
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.35, cy + bodyH * 0.31);
    ctx.lineTo(cx + bodyW * 0.36, cy + bodyH * 0.31);
    ctx.moveTo(cx - bodyW * 0.34, cy - bodyH * 0.12);
    ctx.lineTo(cx - bodyW * 0.34, cy + bodyH * 0.2);
    ctx.stroke();
    ctx.fillStyle = "#242833";
    for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(cx - bodyW * 0.22 + i * bodyW * 0.09, cy + bodyH * 0.2, unit * 0.017, 0, Math.PI * 2);
        ctx.fill();
    }

    addVignette(ctx, width, height, 0.4);
    addGrain(ctx, width, height, random, 0.005);
}

function drawHeadphones(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.5, height * 0.48, width * 0.47, v.glow, 0.34);
    const cx = width * 0.5;
    const cy = height * 0.57;
    const unit = Math.min(width, height);
    const rx = width * 0.27;
    const ry = height * 0.34;

    ctx.save();
    ctx.lineWidth = Math.max(16, unit * 0.07);
    ctx.strokeStyle = mix(v.dark, v.subject, 0.38);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, Math.PI, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(7, unit * 0.024);
    ctx.strokeStyle = rgba(v.subject, 0.8);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.9, ry * 0.9, Math.PI, Math.PI, Math.PI * 2);
    ctx.stroke();

    for (const side of [-1, 1]) {
        const x = cx + side * rx * 0.9;
        const y = cy + ry * 0.15;
        ctx.fillStyle = mix(v.subject, v.accent, 0.3);
        ctx.beginPath();
        ctx.roundRect(x - unit * 0.09, y - unit * 0.12, unit * 0.18, unit * 0.34, unit * 0.06);
        ctx.fill();
        ctx.strokeStyle = rgba(v.glow, 0.9);
        ctx.lineWidth = Math.max(2, unit * 0.009);
        ctx.stroke();
        ctx.fillStyle = mix(v.dark, "#000000", 0.25);
        ctx.beginPath();
        ctx.roundRect(x - unit * 0.058, y - unit * 0.085, unit * 0.116, unit * 0.27, unit * 0.045);
        ctx.fill();
        ctx.strokeStyle = rgba(v.accent, 0.9);
        ctx.lineWidth = Math.max(2, unit * 0.008);
        ctx.beginPath();
        ctx.arc(x, y + unit * 0.035, unit * 0.035, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = v.accent;
        ctx.beginPath();
        ctx.arc(x, y + unit * 0.035, unit * 0.013, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = rgba(v.accent, 0.9);
    ctx.lineWidth = Math.max(2, unit * 0.007);
    ctx.beginPath();
    ctx.moveTo(cx + rx * 0.9, cy + ry * 0.48);
    ctx.bezierCurveTo(cx + rx, cy + ry * 0.9, cx + rx * 0.55, cy + ry * 0.92, cx + rx * 0.52, cy + ry * 0.99);
    ctx.stroke();

    for (let i = 0; i < 5; i += 1) {
        const x = width * (0.18 + i * 0.16);
        const barH = height * (0.03 + random() * 0.07);
        ctx.strokeStyle = rgba(v.glow, 0.55);
        ctx.lineWidth = Math.max(2, unit * 0.008);
        ctx.beginPath();
        ctx.moveTo(x, height * 0.91);
        ctx.lineTo(x, height * 0.91 - barH);
        ctx.stroke();
    }
    addVignette(ctx, width, height, 0.4);
}

function drawVinyl(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.48, height * 0.46, width * 0.5, v.glow, 0.3);
    const cx = width * 0.5;
    const cy = height * 0.52;
    const r = Math.min(width, height) * 0.34;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(range(random, -0.12, 0.12));
    ctx.fillStyle = rgba("#000000", 0.5);
    ctx.beginPath();
    ctx.ellipse(0, r * 1.08, r * 1.08, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mix(v.dark, v.subject, 0.18);
    ctx.beginPath();
    ctx.roundRect(-r * 1.16, -r * 0.92, r * 2.32, r * 1.82, r * 0.08);
    ctx.fill();
    ctx.fillStyle = "#08090e";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 18; i += 1) {
        const ring = r * (0.42 + i * 0.031);
        ctx.strokeStyle = rgba(v.subject, i % 3 === 0 ? 0.28 : 0.13);
        ctx.lineWidth = Math.max(1, r * 0.006);
        ctx.beginPath();
        ctx.arc(0, 0, ring, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = mix(v.accent, v.subject, 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = v.glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = rgba(v.subject, 0.9);
    ctx.lineWidth = Math.max(3, r * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(r * 0.72, -r * 0.68);
    ctx.lineTo(r * 0.97, r * 0.78);
    ctx.lineTo(r * 0.79, r * 0.82);
    ctx.stroke();
    ctx.fillStyle = "#c8ccd8";
    ctx.beginPath();
    ctx.arc(r * 0.73, -r * 0.66, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    addVignette(ctx, width, height, 0.42);
}

function drawCoffee(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.dark]);
    radialBlob(ctx, width * 0.5, height * 0.42, width * 0.48, v.glow, 0.36);
    const cx = width * 0.5;
    const cy = height * 0.58;
    const unit = Math.min(width, height);
    const cupW = width * 0.39;
    const cupH = height * 0.34;

    ctx.fillStyle = rgba("#000000", 0.38);
    ctx.beginPath();
    ctx.ellipse(cx, cy + cupH * 0.72, cupW * 0.73, cupH * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mix(v.dark, v.subject, 0.22);
    ctx.beginPath();
    ctx.ellipse(cx, cy + cupH * 0.68, cupW * 0.75, cupH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(v.accent, 0.9);
    ctx.lineWidth = Math.max(2, unit * 0.012);
    ctx.beginPath();
    ctx.ellipse(cx, cy + cupH * 0.68, cupW * 0.56, cupH * 0.105, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = mix(v.subject, "#ffffff", 0.22);
    ctx.beginPath();
    ctx.moveTo(cx - cupW * 0.5, cy - cupH * 0.35);
    ctx.lineTo(cx + cupW * 0.5, cy - cupH * 0.35);
    ctx.lineTo(cx + cupW * 0.39, cy + cupH * 0.58);
    ctx.quadraticCurveTo(cx, cy + cupH * 0.74, cx - cupW * 0.39, cy + cupH * 0.58);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = rgba(v.subject, 0.9);
    ctx.lineWidth = Math.max(8, unit * 0.045);
    ctx.beginPath();
    ctx.ellipse(cx + cupW * 0.48, cy + cupH * 0.05, cupW * 0.24, cupH * 0.24, 0, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.stroke();

    ctx.fillStyle = mix(v.dark, "#23150f", 0.4);
    ctx.beginPath();
    ctx.ellipse(cx, cy - cupH * 0.34, cupW * 0.49, cupH * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mix(v.glow, "#f1d8b8", 0.35);
    ctx.beginPath();
    ctx.ellipse(cx, cy - cupH * 0.35, cupW * 0.44, cupH * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(v.accent, 0.85);
    ctx.lineWidth = Math.max(2, unit * 0.012);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - cupW * 0.11, cy - cupH * 0.35);
    ctx.bezierCurveTo(cx - cupW * 0.03, cy - cupH * 0.53, cx + cupW * 0.18, cy - cupH * 0.17, cx + cupW * 0.06, cy - cupH * 0.34);
    ctx.bezierCurveTo(cx - cupW * 0.07, cy - cupH * 0.45, cx - cupW * 0.04, cy - cupH * 0.2, cx + cupW * 0.14, cy - cupH * 0.34);
    ctx.stroke();

    ctx.strokeStyle = rgba(v.subject, 0.4);
    ctx.lineWidth = Math.max(2, unit * 0.008);
    for (let i = 0; i < 3; i += 1) {
        const sx = cx + (i - 1) * cupW * 0.2;
        ctx.beginPath();
        ctx.moveTo(sx, cy - cupH * 0.58);
        ctx.bezierCurveTo(sx - cupW * 0.1, cy - cupH * 0.78, sx + cupW * 0.11, cy - cupH * 0.85, sx, cy - cupH * 1.0);
        ctx.stroke();
    }
    addVignette(ctx, width, height, 0.42);
    addGrain(ctx, width, height, random, 0.005);
}

/* --- themes -------------------------------------------------------- */

function drawMoon(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.sky[2]]);
    starField(ctx, width, height, random, Math.round(width * 0.5), "#ffffff", width * 0.0026);
    brightStars(ctx, width, height, random, 5, "#ffffff", width * 0.016);

    const cx = width * range(random, 0.28, 0.72);
    const cy = height * range(random, 0.22, 0.4);
    const radius = Math.min(width, height) * range(random, 0.13, 0.2);

    radialBlob(ctx, cx, cy, radius * 4.2, v.glow, 0.3);
    radialBlob(ctx, cx, cy, radius * 2, v.glow, 0.35);

    /*
     * The crescent is punched out of a full disc on its own layer with
     * destination-out. Drawing two arcs on the main canvas cannot work
     * because the sky behind the moon has to stay visible.
     */
    const phase = range(random, 0, 1);

    const moon = layer(Math.ceil(radius * 2.4), Math.ceil(radius * 2.4), (c, w, h) => {
        c.fillStyle = v.subject;
        c.beginPath();
        c.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
        c.fill();

        c.globalCompositeOperation = "destination-out";
        c.beginPath();
        c.arc(w / 2 + radius * (0.55 + phase * 0.5), h / 2 - radius * 0.18, radius * 1.02, 0, Math.PI * 2);
        c.fill();
    });

    ctx.drawImage(moon, cx - moon.width / 2, cy - moon.height / 2);

    const horizon = height * 0.72;
    const heights = ridgeHeights(random, 7, 0.55);

    fillRidge(ctx, width, height, heights, horizon + height * 0.06, height * 0.16, mix(v.dark, v.sky[2], 0.45), 1.4);
    fillRidge(ctx, width, height, ridgeHeights(random, 7, 0.5), height, height * 0.14, v.dark, 1.4);

    ctx.save();
    ctx.globalAlpha = 0.5;
    radialBlob(ctx, cx, horizon + height * 0.1, radius * 2.6, v.glow, 0.35);
    ctx.restore();

    addVignette(ctx, width, height, 0.4);
    addGrain(ctx, width, height, random, 0.008);
}

function drawStars(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);

    /*
     * The Milky Way is a rotated band of dense faint dots. Without it a
     * starfield looks like random speckle; the band is what makes it look
     * like an actual photograph of the sky.
     */
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(range(random, -0.5, 0.5));

    const bandWidth = width * 1.6;

    for (let i = 0; i < Math.round(width * 1.4); i += 1) {
        const x = (random() - 0.5) * bandWidth;
        const spread = height * 0.16;
        const y = (random() + random() + random() - 1.5) * spread;

        ctx.fillStyle = rgba(v.subject, 0.05 + random() * 0.35);
        ctx.beginPath();
        ctx.arc(x, y, random() ** 2.5 * width * 0.0035 + 0.4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    starField(ctx, width, height, random, Math.round(width * 0.7), "#ffffff", width * 0.003);
    brightStars(ctx, width, height, random, 8, v.accent, width * 0.02);

    ctx.save();
    ctx.strokeStyle = rgba("#ffffff", 0.9);
    ctx.lineWidth = Math.max(1.5, width * 0.0018);
    ctx.lineCap = "round";

    const sx = random() * width * 0.7;
    const sy = random() * height * 0.4;
    const len = width * range(random, 0.1, 0.22);

    const tail = ctx.createLinearGradient(sx, sy, sx + len, sy + len * 0.45);
    tail.addColorStop(0, rgba("#ffffff", 0));
    tail.addColorStop(1, rgba("#ffffff", 0.95));

    ctx.strokeStyle = tail;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + len, sy + len * 0.45);
    ctx.stroke();
    ctx.restore();

    const heights = ridgeHeights(random, 7, 0.52);
    fillRidge(ctx, width, height, heights, height * 0.94, height * 0.16, v.dark, 1.5);

    addVignette(ctx, width, height, 0.45);
    addGrain(ctx, width, height, random, 0.009);
}

function drawMountains(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.sky[2]]);

    const sunY = height * range(random, 0.3, 0.52);
    const sunX = width * range(random, 0.2, 0.8);

    radialBlob(ctx, sunX, sunY, Math.max(width, height) * 0.5, v.glow, 0.45);

    ctx.fillStyle = v.subject;
    ctx.beginPath();
    ctx.arc(sunX, sunY, Math.min(width, height) * 0.055, 0, Math.PI * 2);
    ctx.fill();

    starField(ctx, width, height * 0.5, random, Math.round(width * 0.16), "#ffffff", width * 0.0018);

    const layers = 4;

    for (let i = 0; i < layers; i += 1) {
        const t = i / (layers - 1);
        const heights = ridgeHeights(random, 7, 0.5 + t * 0.08);
        const topY = height * (0.58 + t * 0.14);
        const amplitude = height * (0.34 - t * 0.12);
        const color = mix(v.dark, v.sky[2], 0.55 - t * 0.5);

        fillRidge(ctx, width, height, heights, topY, amplitude, color, 1.6 + t * 0.6);
    }

    /*
     * Snow caps: the top slice of the front ridge, clipped to the ridge
     * path. A mountain silhouette alone reads as hills; the caps are what
     * make it read as alpine.
     */
    const capLine = height * 0.6;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, height);

    const front = ridgeHeights(random, 7, 0.55);

    for (let x = 0; x <= width; x += 2) {
        ctx.lineTo(x, capLine - sampleRidge(front, x / width) * height * 0.22);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = rgba(v.subject, 0.5);
    ctx.fillRect(0, 0, width, height * 0.66);
    ctx.restore();

    fillRidge(ctx, width, height, ridgeHeights(random, 6, 0.5), height * 1.02, height * 0.1, v.dark, 1.2);

    addVignette(ctx, width, height, 0.35);
    addGrain(ctx, width, height, random, 0.009);
}

function drawForest(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.sky[2]]);

    radialBlob(ctx, width * 0.5, height * 0.3, Math.max(width, height) * 0.4, v.glow, 0.3);

    const rows = 4;

    for (let row = 0; row < rows; row += 1) {
        const t = row / (rows - 1);
        const baseY = height * (0.6 + t * 0.42);
        const treeHeight = height * (0.16 + t * 0.3);
        const spacing = width * (0.05 + t * 0.05);
        const color = mix(v.dark, v.sky[2], 0.5 - t * 0.48);

        for (let x = -spacing; x < width + spacing; x += spacing * range(random, 0.7, 1.3)) {
            pineTree(ctx, x, baseY + random() * height * 0.03, treeHeight * range(random, 0.75, 1.2), treeHeight * 0.42, color);
        }

        /*
         * Fog between the rows. Each row is drawn then veiled, which is
         * what produces depth; rows drawn against a flat sky all read as
         * the same distance.
         */
        const fog = ctx.createLinearGradient(0, baseY - treeHeight, 0, baseY + height * 0.05);
        fog.addColorStop(0, rgba(v.sky[2], 0));
        fog.addColorStop(1, rgba(v.sky[2], 0.4 - t * 0.2));

        ctx.fillStyle = fog;
        ctx.fillRect(0, baseY - treeHeight, width, treeHeight + height * 0.06);
    }

    addVignette(ctx, width, height, 0.42);
    addGrain(ctx, width, height, random, 0.009);
}

function drawOcean(ctx, width, height, v, random) {
    const horizon = height * 0.44;

    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);
    ctx.fillRect(0, 0, width, horizon);

    const sunX = width * range(random, 0.3, 0.7);
    const sunY = horizon * range(random, 0.35, 0.75);

    radialBlob(ctx, sunX, sunY, Math.max(width, height) * 0.42, v.glow, 0.5);

    ctx.fillStyle = v.subject;
    ctx.beginPath();
    ctx.arc(sunX, sunY, Math.min(width, height) * 0.06, 0, Math.PI * 2);
    ctx.fill();

    const sea = ctx.createLinearGradient(0, horizon, 0, height);
    sea.addColorStop(0, mix(v.sky[1], v.dark, 0.3));
    sea.addColorStop(1, v.dark);

    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, width, height - horizon);

    /*
     * The sun's reflection is a stack of horizontal dashes that widen as
     * they come toward the viewer. That widening is the cue that the
     * surface is water receding to a horizon rather than stripes.
     */
    ctx.save();

    for (let y = horizon; y < height; y += Math.max(3, height * 0.012)) {
        const t = (y - horizon) / (height - horizon);
        const spread = width * (0.02 + t * 0.16);
        const alpha = (1 - t) * 0.5;

        ctx.fillStyle = rgba(v.glow, alpha * range(random, 0.3, 1));
        ctx.fillRect(sunX - spread / 2 + (random() - 0.5) * spread, y, spread * range(random, 0.3, 1), Math.max(1.5, height * 0.004));
    }

    ctx.restore();

    for (let i = 0; i < 26; i += 1) {
        const t = i / 26;
        const y = horizon + (height - horizon) * t ** 1.8;
        const waveWidth = width * (0.1 + t * 0.5);
        const x = random() * width;

        ctx.strokeStyle = rgba(v.accent, 0.1 + t * 0.35);
        ctx.lineWidth = Math.max(1, height * 0.003 * (0.4 + t));
        ctx.beginPath();

        for (let px = 0; px <= waveWidth; px += 6) {
            const py = y + Math.sin((px / waveWidth) * Math.PI * range(random, 1.5, 3)) * height * 0.006 * (0.5 + t);
            if (px === 0) ctx.moveTo(x + px, py);
            else ctx.lineTo(x + px, py);
        }

        ctx.stroke();
    }

    addVignette(ctx, width, height, 0.35);
    addGrain(ctx, width, height, random, 0.008);
}

function drawRain(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);

    radialBlob(ctx, width * range(random, 0.2, 0.8), height * 0.3, Math.max(width, height) * 0.5, v.glow, 0.22);

    const slant = range(random, 0.08, 0.22);

    ctx.save();
    ctx.lineCap = "round";

    for (let i = 0; i < Math.round(width * 0.9); i += 1) {
        const x = random() * width * 1.2 - width * 0.1;
        const y = random() * height;
        const len = height * range(random, 0.03, 0.12);

        ctx.strokeStyle = rgba(v.accent, range(random, 0.06, 0.4));
        ctx.lineWidth = Math.max(1, width * 0.0012 * range(random, 0.5, 1.6));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len * slant, y + len);
        ctx.stroke();
    }

    ctx.restore();

    /*
     * Droplets sitting on glass, drawn blurred and with a bright rim.
     * Streaks alone read as speed lines; the static beads are what make
     * it read as looking through a window.
     */
    ctx.save();
    ctx.filter = `blur(${Math.max(1, width * 0.0015)}px)`;

    for (let i = 0; i < Math.round(width * 0.05); i += 1) {
        const x = random() * width;
        const y = random() * height;
        const r = Math.min(width, height) * range(random, 0.006, 0.028);

        ctx.fillStyle = rgba(v.accent, 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba("#ffffff", 0.3);
        ctx.beginPath();
        ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    const heights = ridgeHeights(random, 6, 0.5);
    fillRidge(ctx, width, height, heights, height * 0.9, height * 0.12, v.dark, 1.2);

    addVignette(ctx, width, height, 0.5);
    addGrain(ctx, width, height, random, 0.01);
}

function drawCity(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.sky[2]]);
    starField(ctx, width, height * 0.55, random, Math.round(width * 0.22), "#ffffff", width * 0.0016);

    radialBlob(ctx, width * 0.5, height * 0.78, width * 0.6, v.glow, 0.35);

    const skyline = height * 0.98;
    let x = -width * 0.05;

    while (x < width) {
        const bw = width * range(random, 0.03, 0.09);
        const bh = height * range(random, 0.18, 0.58);
        const top = skyline - bh;

        ctx.fillStyle = mix(v.dark, v.sky[2], 0.12);
        ctx.fillRect(x, top, bw, bh);

        const cols = Math.max(1, Math.floor(bw / (width * 0.012)));
        const rows = Math.max(1, Math.floor(bh / (height * 0.035)));

        for (let c = 0; c < cols; c += 1) {
            for (let r = 0; r < rows; r += 1) {
                if (random() > 0.45) {
                    continue;
                }

                ctx.fillStyle = rgba(v.accent, range(random, 0.35, 1));
                ctx.fillRect(
                    x + bw * 0.14 + c * (bw * 0.72) / cols,
                    top + height * 0.02 + r * (bh * 0.9) / rows,
                    Math.max(1.5, (bw * 0.5) / cols),
                    Math.max(1.5, (bh * 0.4) / rows)
                );
            }
        }

        if (random() < 0.3) {
            ctx.fillStyle = mix(v.dark, v.sky[2], 0.12);
            ctx.fillRect(x + bw * 0.45, top - height * 0.06, Math.max(2, bw * 0.06), height * 0.06);
        }

        x += bw * range(random, 0.85, 1.05);
    }

    ctx.save();
    ctx.filter = `blur(${Math.round(width * 0.02)}px)`;
    ctx.fillStyle = rgba(v.glow, 0.25);
    ctx.fillRect(0, skyline - height * 0.16, width, height * 0.16);
    ctx.restore();

    addVignette(ctx, width, height, 0.45);
    addGrain(ctx, width, height, random, 0.01);
}

function drawRoses(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);
    radialBlob(ctx, width * 0.5, height * 0.45, Math.max(width, height) * 0.6, v.glow, 0.2);

    const count = Math.round(range(random, 4, 8));
    const base = Math.min(width, height);

    for (let i = 0; i < count; i += 1) {
        const cx = width * range(random, 0.1, 0.9);
        const cy = height * range(random, 0.15, 0.9);
        const radius = base * range(random, 0.07, 0.17);

        for (let l = 0; l < 3; l += 1) {
            const angle = random() * Math.PI * 2;
            leaf(ctx, cx, cy, angle, radius * range(random, 1.3, 2.1), radius * 0.42, mix(v.dark, "#2f6b3a", 0.55));
        }

        ctx.save();
        ctx.filter = `blur(${Math.round(radius * 0.12)}px)`;
        ctx.fillStyle = rgba("#000000", 0.35);
        ctx.beginPath();
        ctx.arc(cx + radius * 0.12, cy + radius * 0.16, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        roseBloom(ctx, cx, cy, radius, v.sky[1], v.subject, random);
    }

    addVignette(ctx, width, height, 0.5);
    addGrain(ctx, width, height, random, 0.009);
}

function drawSakura(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);
    radialBlob(ctx, width * 0.7, height * 0.25, Math.max(width, height) * 0.5, v.glow, 0.35);

    const blossom = (cx, cy, radius, color) => {
        for (let i = 0; i < 5; i += 1) {
            const angle = (i / 5) * Math.PI * 2 + random() * 0.2;
            petal(ctx, cx, cy, angle, radius, radius * 0.78, color);
        }

        ctx.fillStyle = mix(v.accent, "#ffffff", 0.4);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.16, 0, Math.PI * 2);
        ctx.fill();
    };

    /*
     * One branch carried across the frame with clusters along it. A
     * scatter of blossoms with no branch reads as pink confetti.
     */
    const startY = height * range(random, 0.05, 0.3);
    const points = [];

    for (let i = 0; i <= 6; i += 1) {
        points.push({
            x: (i / 6) * width * 1.05 - width * 0.03,
            y: startY + Math.sin(i * 0.9) * height * 0.1 + i * height * 0.045,
        });
    }

    ctx.save();
    ctx.strokeStyle = mix(v.dark, "#4a2f22", 0.6);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let d = 0; d < 2; d += 1) {
        ctx.lineWidth = Math.max(3, width * (0.008 - d * 0.004));
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i += 1) {
            const prev = points[i - 1];
            const cur = points[i];
            ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
        }

        ctx.stroke();
    }

    ctx.restore();

    for (let i = 1; i < points.length; i += 1) {
        const p = points[i];
        const clusters = Math.round(range(random, 2, 5));

        for (let c = 0; c < clusters; c += 1) {
            const cx = p.x + (random() - 0.5) * width * 0.07;
            const cy = p.y + (random() - 0.5) * height * 0.09;
            const radius = Math.min(width, height) * range(random, 0.025, 0.055);

            blossom(cx, cy, radius, mix(v.subject, "#ffffff", random() * 0.35));
        }
    }

    for (let i = 0; i < Math.round(width * 0.03); i += 1) {
        const cx = random() * width;
        const cy = random() * height;
        const radius = Math.min(width, height) * range(random, 0.008, 0.02);

        ctx.save();
        ctx.globalAlpha = range(random, 0.35, 0.9);
        petal(ctx, cx, cy, random() * Math.PI * 2, radius * 2, radius, v.subject);
        ctx.restore();
    }

    addVignette(ctx, width, height, 0.3);
    addGrain(ctx, width, height, random, 0.008);
}

function drawDaisies(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);
    radialBlob(ctx, width * 0.5, height * 0.2, Math.max(width, height) * 0.55, v.glow, 0.3);

    const count = Math.round(range(random, 9, 18));

    for (let i = 0; i < count; i += 1) {
        const cx = random() * width;
        const cy = height * range(random, 0.25, 1.02);
        const depth = (cy / height) ** 1.4;
        const radius = Math.min(width, height) * (0.02 + depth * 0.075);

        ctx.save();
        ctx.strokeStyle = mix(v.dark, "#3f7a45", 0.5);
        ctx.lineWidth = Math.max(1.5, radius * 0.14);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx + radius * 0.4, cy + radius * 2.4, cx + radius * 0.1, cy + radius * 4.2);
        ctx.stroke();
        ctx.restore();

        const petals = Math.round(range(random, 11, 17));

        for (let p = 0; p < petals; p += 1) {
            const angle = (p / petals) * Math.PI * 2;
            petal(ctx, cx, cy, angle, radius * 1.5, radius * 0.42, mix("#ffffff", v.subject, random() * 0.25));
        }

        ctx.fillStyle = v.accent;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = rgba("#000000", 0.25);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    addVignette(ctx, width, height, 0.35);
    addGrain(ctx, width, height, random, 0.008);
}

function drawClouds(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.sky[2]]);

    const count = Math.round(range(random, 7, 14));

    for (let i = 0; i < count; i += 1) {
        const y = height * range(random, 0.1, 0.95);
        const depth = y / height;
        const radius = Math.min(width, height) * (0.05 + depth * range(random, 0.1, 0.22));

        softCloud(
            ctx,
            random() * width,
            y,
            radius,
            mix(v.subject, v.sky[2], 1 - depth),
            0.35 + depth * 0.4,
            7
        );
    }

    radialBlob(ctx, width * range(random, 0.2, 0.8), height * 0.18, Math.max(width, height) * 0.45, v.glow, 0.4);

    addVignette(ctx, width, height, 0.3);
    addGrain(ctx, width, height, random, 0.008);
}

function drawSunset(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1], v.sky[2]]);

    const horizon = height * 0.68;
    const sunX = width * 0.5;
    const sunR = Math.min(width, height) * range(random, 0.12, 0.19);

    radialBlob(ctx, sunX, horizon, sunR * 6, v.glow, 0.45);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, horizon);
    ctx.clip();

    ctx.fillStyle = v.subject;
    ctx.beginPath();
    ctx.arc(sunX, horizon, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /*
     * Horizontal cloud bars broken across the sun. The bars are what sell
     * a sunset over a plain gradient — they give the light something to
     * pass behind.
     */
    for (let i = 0; i < Math.round(range(random, 6, 12)); i += 1) {
        const y = horizon * range(random, 0.25, 0.98);
        const barH = height * range(random, 0.008, 0.03);
        const w = width * range(random, 0.3, 1.1);
        const x = random() * width - w * 0.3;

        ctx.save();
        ctx.filter = `blur(${Math.round(barH * 0.9)}px)`;
        ctx.fillStyle = rgba(v.dark, range(random, 0.25, 0.7));
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y, w / 2, barH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    const sea = ctx.createLinearGradient(0, horizon, 0, height);
    sea.addColorStop(0, mix(v.sky[2], v.subject, 0.4));
    sea.addColorStop(1, v.dark);

    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, width, height - horizon);

    for (let y = horizon; y < height; y += Math.max(3, height * 0.014)) {
        const t = (y - horizon) / (height - horizon);
        const spread = sunR * (0.6 + t * 3.4);

        ctx.fillStyle = rgba(v.subject, (1 - t) * 0.45 * range(random, 0.3, 1));
        ctx.fillRect(sunX - spread / 2 + (random() - 0.5) * spread, y, spread * range(random, 0.2, 0.9), Math.max(1.5, height * 0.004));
    }

    for (let i = 0; i < Math.round(range(random, 3, 7)); i += 1) {
        bird(
            ctx,
            width * range(random, 0.15, 0.85),
            height * range(random, 0.15, 0.45),
            Math.min(width, height) * range(random, 0.012, 0.03),
            rgba(v.dark, 0.85),
            range(random, 0.4, 0.9)
        );
    }

    addVignette(ctx, width, height, 0.35);
    addGrain(ctx, width, height, random, 0.008);
}

function drawSkull(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);
    radialBlob(ctx, width * 0.5, height * 0.45, Math.max(width, height) * 0.5, v.glow, 0.22);

    const cx = width * 0.5;
    const cy = height * 0.48;
    const s = Math.min(width, height) * 0.3;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(range(random, -0.12, 0.12));

    const bone = v.subject;
    const shade = mix(bone, v.dark, 0.35);

    ctx.fillStyle = bone;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.18, s * 0.72, s * 0.68, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-s * 0.42, s * 0.28);
    ctx.lineTo(s * 0.42, s * 0.28);
    ctx.lineTo(s * 0.3, s * 0.78);
    ctx.lineTo(-s * 0.3, s * 0.78);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.62, s * 0.34, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = v.dark;
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.14, s * 0.22, s * 0.25, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.3, -s * 0.14, s * 0.22, s * 0.25, -0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba(v.accent, 0.85);
    ctx.beginPath();
    ctx.arc(-s * 0.3, -s * 0.12, s * 0.08, 0, Math.PI * 2);
    ctx.arc(s * 0.3, -s * 0.12, s * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = v.dark;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.08);
    ctx.lineTo(-s * 0.1, s * 0.3);
    ctx.lineTo(s * 0.1, s * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = v.dark;
    ctx.lineWidth = Math.max(2, s * 0.035);

    for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.13, s * 0.42);
        ctx.lineTo(i * s * 0.13, s * 0.72);
        ctx.stroke();
    }

    ctx.restore();

    radialBlob(ctx, cx, cy, s * 2.4, v.glow, 0.18);

    addVignette(ctx, width, height, 0.6);
    addGrain(ctx, width, height, random, 0.011);
}

function drawButterfly(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);
    radialBlob(ctx, width * 0.5, height * 0.5, Math.max(width, height) * 0.55, v.glow, 0.3);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const s = Math.min(width, height) * 0.34;
    const tilt = range(random, -0.2, 0.2);

    const wing = (dir) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.scale(dir, 1);

        const gradient = ctx.createLinearGradient(0, -s, s, s);
        gradient.addColorStop(0, v.subject);
        gradient.addColorStop(1, mix(v.subject, v.accent, 0.8));

        ctx.fillStyle = gradient;

        ctx.beginPath();
        ctx.moveTo(0, -s * 0.05);
        ctx.bezierCurveTo(s * 0.35, -s * 0.95, s * 1.15, -s * 0.85, s * 0.95, -s * 0.2);
        ctx.bezierCurveTo(s * 0.85, s * 0.05, s * 0.4, s * 0.05, 0, s * 0.02);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, s * 0.05);
        ctx.bezierCurveTo(s * 0.5, s * 0.1, s * 0.9, s * 0.5, s * 0.62, s * 0.9);
        ctx.bezierCurveTo(s * 0.4, s * 1.1, s * 0.1, s * 0.6, 0, s * 0.28);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rgba(v.dark, 0.55);
        ctx.beginPath();
        ctx.arc(s * 0.62, -s * 0.42, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.42, s * 0.55, s * 0.07, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = rgba(v.dark, 0.4);
        ctx.lineWidth = Math.max(1.5, s * 0.02);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(s * 0.9, -s * 0.3);
        ctx.moveTo(0, s * 0.05);
        ctx.lineTo(s * 0.6, s * 0.75);
        ctx.stroke();

        ctx.restore();
    };

    wing(1);
    wing(-1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);
    ctx.fillStyle = v.dark;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.055, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = v.dark;
    ctx.lineWidth = Math.max(1.5, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.quadraticCurveTo(s * 0.12, -s * 0.68, s * 0.22, -s * 0.74);
    ctx.moveTo(0, -s * 0.4);
    ctx.quadraticCurveTo(-s * 0.12, -s * 0.68, -s * 0.22, -s * 0.74);
    ctx.stroke();
    ctx.restore();

    addVignette(ctx, width, height, 0.4);
    addGrain(ctx, width, height, random, 0.008);
}

function drawSmoke(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);

    const strands = Math.round(range(random, 7, 12));

    for (let i = 0; i < strands; i += 1) {
        const startX = width * range(random, 0.2, 0.8);
        const startY = height * range(random, 0.85, 1.05);
        const wobble = width * range(random, 0.05, 0.2);
        const rise = height * range(random, 0.5, 0.95);

        ctx.save();
        ctx.filter = `blur(${Math.round(Math.max(width, height) * range(random, 0.012, 0.035))}px)`;
        ctx.strokeStyle = rgba(i % 3 === 0 ? v.accent : v.subject, range(random, 0.18, 0.62));
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(6, width * range(random, 0.01, 0.045));

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(
            startX + wobble,
            startY - rise * 0.35,
            startX - wobble,
            startY - rise * 0.7,
            startX + (random() - 0.5) * wobble * 2,
            startY - rise
        );
        ctx.stroke();
        ctx.restore();
    }

    /*
     * Smoke is only legible against the black if a few wisps catch the light.
     * Without these bright cores the whole frame sits in the same low band of
     * luminance and reads as a smudge rather than plumes.
     */
    const cores = Math.round(range(random, 3, 5));

    for (let i = 0; i < cores; i += 1) {
        const startX = width * range(random, 0.28, 0.72);
        const startY = height * range(random, 0.9, 1.0);
        const rise = height * range(random, 0.45, 0.85);
        const wobble = width * range(random, 0.04, 0.14);

        ctx.save();
        ctx.filter = `blur(${Math.round(Math.max(width, height) * range(random, 0.006, 0.016))}px)`;
        ctx.globalCompositeOperation = "screen";
        ctx.strokeStyle = rgba(mix(v.subject, "#ffffff", 0.7), range(random, 0.22, 0.5));
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(2, width * range(random, 0.003, 0.011));

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(
            startX - wobble,
            startY - rise * 0.4,
            startX + wobble,
            startY - rise * 0.72,
            startX + (random() - 0.5) * wobble,
            startY - rise
        );
        ctx.stroke();
        ctx.restore();
    }

    radialBlob(ctx, width * 0.5, height * 0.22, Math.max(width, height) * 0.42, v.glow, 0.4);

    addVignette(ctx, width, height, 0.62);
    addGrain(ctx, width, height, random, 0.012);
}

function drawLightning(ctx, width, height, v, random) {
    verticalGradient(ctx, width, height, [v.sky[0], v.sky[1]]);

    for (let i = 0; i < 8; i += 1) {
        softCloud(
            ctx,
            random() * width,
            height * range(random, 0.05, 0.4),
            Math.min(width, height) * range(random, 0.1, 0.26),
            mix(v.dark, v.sky[1], 0.5),
            0.7,
            8
        );
    }

    const bolt = (startX, startY, endY, spread, alpha, widthMul) => {
        const points = [{ x: startX, y: startY }];
        let y = startY;
        let x = startX;

        while (y < endY) {
            y += height * range(random, 0.03, 0.08);
            x += (random() - 0.5) * spread;
            points.push({ x, y });
        }

        ctx.save();
        ctx.shadowColor = rgba(v.accent, alpha);
        ctx.shadowBlur = Math.max(width, height) * 0.03;
        ctx.strokeStyle = rgba(v.subject, alpha);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(2, width * 0.004 * widthMul);

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (const p of points) {
            ctx.lineTo(p.x, p.y);
        }

        ctx.stroke();
        ctx.restore();

        return points;
    };

    const main = bolt(width * range(random, 0.3, 0.7), 0, height * range(random, 0.7, 0.95), width * 0.09, 1, 1);

    for (let i = 0; i < 3; i += 1) {
        const from = main[Math.round(range(random, 2, main.length - 2))];
        bolt(from.x, from.y, from.y + height * range(random, 0.15, 0.35), width * 0.07, 0.6, 0.5);
    }

    radialBlob(ctx, width * 0.5, height * 0.3, Math.max(width, height) * 0.6, v.accent, 0.22);

    const heights = ridgeHeights(random, 6, 0.5);
    fillRidge(ctx, width, height, heights, height * 0.98, height * 0.14, v.dark, 1.4);

    addVignette(ctx, width, height, 0.5);
    addGrain(ctx, width, height, random, 0.01);
}

/*
 * Each theme owns its variants. Unlike the abstract generator, a theme
 * cannot borrow another theme's palette: a rose needs rose reds and a
 * pine forest needs greens, so recombining accents across themes would
 * produce a blue rose. Variants are keyed by the catalog's existing color
 * vocabulary so the Studio filters keep working.
 */
const THEMES = {
    moon: {
        label: "moonlit night",
        draw: drawMoon,
        aesthetics: ["dark", "dreamcore", "nature"],
        moods: ["night", "calm", "mysterious"],
        tags: ["moon", "nighttime", "stars"],
        variants: {
            blue: { sky: ["#03060f", "#0a1730", "#16305c"], glow: "#8fb8e8", subject: "#eef3fb", dark: "#05070d", accent: "#9dc4f0" },
            purple: { sky: ["#0a0518", "#1d1040", "#3a1f6b"], glow: "#c39df0", subject: "#f1e9ff", dark: "#07040f", accent: "#b48ce8" },
            black: { sky: ["#040405", "#0e0e13", "#1e1e28"], glow: "#b9bcc8", subject: "#f2f3f7", dark: "#050506", accent: "#a3a9b3" },
            teal: { sky: ["#02100f", "#072b2c", "#0d4a4c"], glow: "#7fd8d4", subject: "#e8fbf8", dark: "#020a0a", accent: "#5fd8dc" },
        },
    },
    stars: {
        label: "starfield",
        draw: drawStars,
        aesthetics: ["dark", "dreamcore", "minimalist"],
        moods: ["night", "dreamy", "ethereal"],
        tags: ["stars", "nighttime", "galaxy"],
        variants: {
            indigo: { sky: ["#04041a", "#141447"], glow: "#8f8ff0", subject: "#dfe0ff", dark: "#03030e", accent: "#9d8ff0" },
            blue: { sky: ["#020617", "#0b2148"], glow: "#7fb6e8", subject: "#dcecff", dark: "#020411", accent: "#7fb6e8" },
            purple: { sky: ["#0b0418", "#2a0f4d"], glow: "#c99df0", subject: "#f0e2ff", dark: "#080312", accent: "#c07de8" },
            black: { sky: ["#030304", "#131318"], glow: "#c8ccd8", subject: "#e9ebf2", dark: "#040405", accent: "#b9bcc8" },
        },
    },
    mountains: {
        label: "mountain range",
        draw: drawMountains,
        aesthetics: ["nature", "dark", "minimalist"],
        moods: ["calm", "atmospheric", "peaceful"],
        tags: ["mountains", "horizon", "landscape"],
        variants: {
            orange: { sky: ["#1a0a04", "#6b2a08", "#d9762a"], glow: "#ffb066", subject: "#ffd9a8", dark: "#0d0604", accent: "#ffa14d" },
            blue: { sky: ["#040c1c", "#123058", "#2f6ea8"], glow: "#9fd0f5", subject: "#e6f3ff", dark: "#030812", accent: "#7fb6e8" },
            purple: { sky: ["#0c0518", "#331252", "#6b2f96"], glow: "#e0a8f0", subject: "#f6e2ff", dark: "#080312", accent: "#b478e8" },
            teal: { sky: ["#031416", "#0a3d42", "#177a80"], glow: "#8fe8e4", subject: "#e2fbf9", dark: "#020a0b", accent: "#5fd8dc" },
        },
    },
    forest: {
        label: "pine forest",
        draw: drawForest,
        aesthetics: ["nature", "dark", "cottagecore"],
        moods: ["calm", "atmospheric", "mysterious"],
        tags: ["forest", "trees", "fog"],
        variants: {
            green: { sky: ["#04140c", "#0d3d24", "#3f8a5c"], glow: "#a8e8c0", subject: "#dff5e6", dark: "#020a06", accent: "#6fd39a" },
            teal: { sky: ["#02120f", "#0a3a38", "#1a6e68"], glow: "#8fe0d4", subject: "#dff5ef", dark: "#020a09", accent: "#5fd8dc" },
            black: { sky: ["#050607", "#12151a", "#2a3038"], glow: "#b6bec9", subject: "#e4e8ee", dark: "#030405", accent: "#a3a9b3" },
            brown: { sky: ["#150c05", "#3d2410", "#7a4b2a"], glow: "#e0b078", subject: "#f2e0c8", dark: "#0a0603", accent: "#c08a55" },
        },
    },
    ocean: {
        label: "ocean horizon",
        draw: drawOcean,
        aesthetics: ["nature", "minimalist", "soft"],
        moods: ["calm", "peaceful", "dreamy"],
        tags: ["ocean", "horizon", "water"],
        variants: {
            blue: { sky: ["#061a33", "#1f5f9e"], glow: "#ffd9a0", subject: "#ffe9c4", dark: "#03101f", accent: "#7fb6e8" },
            teal: { sky: ["#03181a", "#12898f"], glow: "#ffe0b0", subject: "#fff0d4", dark: "#020e10", accent: "#5fd8dc" },
            pink: { sky: ["#2b0a1a", "#a8467c"], glow: "#ffc0d8", subject: "#ffe0ee", dark: "#180511", accent: "#ffa3c4" },
            orange: { sky: ["#240d02", "#c9611a"], glow: "#ffc07a", subject: "#ffe2b8", dark: "#140702", accent: "#ffa14d" },
        },
    },
    rain: {
        label: "rain on glass",
        draw: drawRain,
        aesthetics: ["dark", "minimalist", "grunge"],
        moods: ["melancholic", "moody", "atmospheric"],
        tags: ["rain", "window", "moody"],
        variants: {
            blue: { sky: ["#050b16", "#152a44"], glow: "#6f9fd0", subject: "#c8ddf5", dark: "#03060c", accent: "#8fb8e8" },
            teal: { sky: ["#03110f", "#0f3a38"], glow: "#6fc4bc", subject: "#c8ece8", dark: "#020808", accent: "#5fd8dc" },
            gray: { sky: ["#0b0c0e", "#2a2e35"], glow: "#9aa2ad", subject: "#d5dae1", dark: "#060708", accent: "#a3a9b3" },
            purple: { sky: ["#0c0616", "#2c1442"], glow: "#a07fd0", subject: "#ddd0f0", dark: "#070310", accent: "#b478e8" },
        },
    },
    city: {
        label: "night skyline",
        draw: drawCity,
        aesthetics: ["cyber", "dark", "anime"],
        moods: ["night", "neon", "energetic"],
        tags: ["city", "skyline", "nighttime"],
        variants: {
            purple: { sky: ["#0a0418", "#2a0f4d", "#5c2a86"], glow: "#e0a0f0", subject: "#f0dcff", dark: "#060210", accent: "#ffd166" },
            blue: { sky: ["#03081a", "#0f2a52", "#1f5f9e"], glow: "#8fc4f0", subject: "#dcecff", dark: "#020512", accent: "#ffd166" },
            pink: { sky: ["#1a0512", "#5c1338", "#a83a6e"], glow: "#ffb0cc", subject: "#ffdcea", dark: "#10030a", accent: "#ffe08a" },
            black: { sky: ["#040406", "#101018", "#22222e"], glow: "#b0b6c4", subject: "#e6e9ee", dark: "#030304", accent: "#ffd166" },
        },
    },
    roses: {
        label: "rose blooms",
        draw: drawRoses,
        aesthetics: ["romantic", "gothic", "soft"],
        moods: ["romantic", "dark", "elegant"],
        tags: ["flowers", "roses", "botanical"],
        variants: {
            red: { sky: ["#1c0306", "#5c0a12"], glow: "#ff8a9a", subject: "#e8324a", dark: "#120204", accent: "#f0576a" },
            pink: { sky: ["#2b0a1a", "#7a1f47"], glow: "#ffb0cc", subject: "#e85a90", dark: "#1a0511", accent: "#ffa3c4" },
            black: { sky: ["#080406", "#1c1016"], glow: "#c08a9a", subject: "#8a2438", dark: "#050304", accent: "#b01726" },
            cream: { sky: ["#3a2a20", "#7a5a44"], glow: "#ffe8cc", subject: "#e8c8a8", dark: "#241610", accent: "#dccbb0" },
        },
    },
    sakura: {
        label: "cherry blossom",
        draw: drawSakura,
        aesthetics: ["soft", "romantic", "anime"],
        moods: ["gentle", "dreamy", "soft"],
        tags: ["flowers", "sakura", "botanical"],
        variants: {
            pink: { sky: ["#3a0f26", "#c46a92"], glow: "#ffe0ee", subject: "#ffb0cc", dark: "#2b0a1a", accent: "#ffd166" },
            cream: { sky: ["#6b5240", "#dccbb0"], glow: "#fff6e8", subject: "#ffc8d8", dark: "#3a2a20", accent: "#f0c65a" },
            white: { sky: ["#5c626c", "#e6e9ee"], glow: "#ffffff", subject: "#ffd0dc", dark: "#3a3f47", accent: "#ffe45c" },
            purple: { sky: ["#2a0f3d", "#8a5ab8"], glow: "#f0dcff", subject: "#e0a8f0", dark: "#1a0826", accent: "#ffd166" },
        },
    },
    daisies: {
        label: "daisy field",
        draw: drawDaisies,
        aesthetics: ["nature", "cottagecore", "soft"],
        moods: ["bright", "gentle", "peaceful"],
        tags: ["flowers", "daisies", "botanical"],
        variants: {
            green: { sky: ["#0d3d24", "#6fd39a"], glow: "#fff6d0", subject: "#ffffff", dark: "#062415", accent: "#f0c65a" },
            cream: { sky: ["#8a7458", "#e6d8bc"], glow: "#fffaf0", subject: "#ffffff", dark: "#4a3a28", accent: "#e8b23a" },
            blue: { sky: ["#123058", "#7fb6e8"], glow: "#fff4d8", subject: "#ffffff", dark: "#08182c", accent: "#f0c65a" },
            yellow: { sky: ["#5c4708", "#e8c93a"], glow: "#fffbe0", subject: "#fffaf0", dark: "#332704", accent: "#ffa14d" },
        },
    },
    clouds: {
        label: "cloudscape",
        draw: drawClouds,
        aesthetics: ["dreamcore", "soft", "minimalist"],
        moods: ["dreamy", "ethereal", "calm"],
        tags: ["clouds", "sky", "dreamy-night"],
        variants: {
            pink: { sky: ["#3a0f26", "#a8467c", "#ffc0d8"], glow: "#fff0f6", subject: "#ffd8e6", dark: "#2b0a1a", accent: "#ffa3c4" },
            blue: { sky: ["#062040", "#1f5f9e", "#a8d4f5"], glow: "#fff4dc", subject: "#e8f4ff", dark: "#031428", accent: "#7fb6e8" },
            purple: { sky: ["#1a0833", "#5c2a86", "#c8a0e8"], glow: "#f8ecff", subject: "#eeddff", dark: "#10051f", accent: "#b478e8" },
            orange: { sky: ["#2e1004", "#b8560f", "#ffb877"], glow: "#fff0d4", subject: "#ffe4c0", dark: "#1c0902", accent: "#ffa14d" },
        },
    },
    sunset: {
        label: "sunset over water",
        draw: drawSunset,
        aesthetics: ["nature", "romantic", "dreamcore"],
        moods: ["warm", "melancholic", "peaceful"],
        tags: ["sunset", "horizon", "warm-palette"],
        variants: {
            orange: { sky: ["#1f0a04", "#8a2f08", "#e88a3a"], glow: "#ffc078", subject: "#ff9a3c", dark: "#120503", accent: "#ffa14d" },
            pink: { sky: ["#240617", "#8a1f4a", "#f08ab0"], glow: "#ffc8dc", subject: "#ff6a9a", dark: "#160410", accent: "#ffa3c4" },
            purple: { sky: ["#150630", "#4a1a70", "#b06ac8"], glow: "#f0c0ff", subject: "#e078d0", dark: "#0d0420", accent: "#b478e8" },
            red: { sky: ["#1c0306", "#7a0d14", "#e05a4a"], glow: "#ffb090", subject: "#ff5a3c", dark: "#120203", accent: "#f0576a" },
        },
    },
    skull: {
        label: "skull",
        draw: drawSkull,
        aesthetics: ["horror", "gothic", "dark"],
        moods: ["macabre", "eerie", "dark"],
        tags: ["skull", "spooky", "gothic"],
        variants: {
            black: { sky: ["#050506", "#1a1a20"], glow: "#6a6a78", subject: "#e2e2e8", dark: "#020203", accent: "#b01726" },
            red: { sky: ["#120204", "#3d060c"], glow: "#8a1a22", subject: "#e8dcd8", dark: "#0a0102", accent: "#ff3a4a" },
            green: { sky: ["#04140c", "#0d3d24"], glow: "#2f8a58", subject: "#dceee0", dark: "#020a06", accent: "#6fd39a" },
            purple: { sky: ["#0c0418", "#2a0f4d"], glow: "#6b2f96", subject: "#e6dcf0", dark: "#070210", accent: "#b478e8" },
        },
    },
    butterfly: {
        label: "butterfly",
        draw: drawButterfly,
        aesthetics: ["soft", "dreamcore", "nature"],
        moods: ["dreamy", "gentle", "ethereal"],
        tags: ["butterfly", "creature", "symmetry"],
        variants: {
            purple: { sky: ["#1a0833", "#6b2f96"], glow: "#e0b0ff", subject: "#a05ad0", dark: "#10051f", accent: "#ffd166" },
            blue: { sky: ["#062040", "#1f5f9e"], glow: "#a8d8ff", subject: "#3a8ad0", dark: "#031428", accent: "#5fd8dc" },
            orange: { sky: ["#2e1004", "#b8560f"], glow: "#ffd0a0", subject: "#e8781f", dark: "#1c0902", accent: "#ffe45c" },
            pink: { sky: ["#3a0f26", "#a8467c"], glow: "#ffd0e4", subject: "#e05a9a", dark: "#2b0a1a", accent: "#ffa3c4" },
        },
    },
    smoke: {
        label: "smoke wisps",
        draw: drawSmoke,
        aesthetics: ["dark", "grunge", "minimalist"],
        moods: ["eerie", "moody", "ominous"],
        tags: ["smoke", "moody", "textured"],
        variants: {
            black: { sky: ["#040405", "#16161c"], glow: "#5a5a6e", subject: "#b8bcc6", dark: "#020203", accent: "#8a8a9a" },
            red: { sky: ["#120203", "#3d060b"], glow: "#8a1a20", subject: "#d8a8a8", dark: "#0a0102", accent: "#ff3a4a" },
            teal: { sky: ["#02100f", "#0a3a38"], glow: "#1a6e68", subject: "#a8d8d0", dark: "#010707", accent: "#5fd8dc" },
            purple: { sky: ["#0a0418", "#240d42"], glow: "#4a1f78", subject: "#c8a8e0", dark: "#060210", accent: "#b478e8" },
        },
    },
    lightning: {
        label: "thunderstorm",
        draw: drawLightning,
        aesthetics: ["dark", "horror", "nature"],
        moods: ["dramatic", "intense", "ominous"],
        tags: ["storm", "lightning", "dramatic"],
        variants: {
            indigo: { sky: ["#04041a", "#1a1a56"], glow: "#6a6ad0", subject: "#e8e8ff", dark: "#020210", accent: "#8f8ff0" },
            purple: { sky: ["#0c0418", "#33124f"], glow: "#8a4ac0", subject: "#f0e0ff", dark: "#070210", accent: "#c07de8" },
            teal: { sky: ["#02100f", "#0a3a3c"], glow: "#2a8a88", subject: "#e0fbf8", dark: "#010707", accent: "#5fd8dc" },
            black: { sky: ["#040406", "#1a1a22"], glow: "#6a6a78", subject: "#f0f2f7", dark: "#020203", accent: "#b9bcc8" },
        },
    },
    portrait: {
        label: "editorial portrait",
        draw: drawPortrait,
        aesthetics: ["anime", "soft", "dreamcore"],
        moods: ["moody", "elegant", "cinematic"],
        tags: ["portrait", "person", "fashion", "editorial"],
        variants: {
            blue: { sky: ["#071321", "#28496a"], glow: "#91bde5", subject: "#c5d8ed", dark: "#090e18", accent: "#71c7dd" },
            purple: { sky: ["#160a20", "#56345f"], glow: "#d4a0d4", subject: "#edc9df", dark: "#120a17", accent: "#f39aba" },
            green: { sky: ["#071710", "#315b43"], glow: "#9bc89c", subject: "#d9e3c2", dark: "#080f0a", accent: "#d5b66b" },
            pink: { sky: ["#25101c", "#80405b"], glow: "#f2b1c8", subject: "#f4d8df", dark: "#170a12", accent: "#ff9dbe" },
        },
    },
    streetwear: {
        label: "streetwear at night",
        draw: drawStreetwear,
        aesthetics: ["cyber", "anime", "grunge"],
        moods: ["night", "energetic", "digital"],
        tags: ["person", "streetwear", "fashion", "city"],
        variants: {
            purple: { sky: ["#07040f", "#281247"], glow: "#c47aff", subject: "#b7a4d8", dark: "#08060d", accent: "#fa4fc6" },
            blue: { sky: ["#030811", "#10294b"], glow: "#5c9fd4", subject: "#b9c9dc", dark: "#05080e", accent: "#45d9ed" },
            green: { sky: ["#04120d", "#12442e"], glow: "#5ad69b", subject: "#c4dacb", dark: "#030a07", accent: "#b5fa72" },
            black: { sky: ["#050507", "#1c1c25"], glow: "#9096a8", subject: "#d1d2d8", dark: "#030305", accent: "#ff4f72" },
        },
    },
    car: {
        label: "neon sports car",
        draw: drawCar,
        aesthetics: ["cyber", "luxury", "dark"],
        moods: ["night", "cinematic", "energetic"],
        tags: ["car", "vehicle", "sports-car", "city"],
        variants: {
            red: { sky: ["#09060d", "#39131e", "#8a2942"], glow: "#fb7893", subject: "#df3d57", dark: "#060509", accent: "#ffd166" },
            blue: { sky: ["#030817", "#10294b", "#24558a"], glow: "#68b9ef", subject: "#367fca", dark: "#03050d", accent: "#65e6fa" },
            black: { sky: ["#040406", "#171923", "#333747"], glow: "#b5bdcc", subject: "#596071", dark: "#020203", accent: "#ffe59b" },
            purple: { sky: ["#0b0615", "#281142", "#54286f"], glow: "#d28df2", subject: "#8853ba", dark: "#05030a", accent: "#ff75cc" },
        },
    },
    motorcycle: {
        label: "night motorcycle",
        draw: drawMotorcycle,
        aesthetics: ["cyber", "dark", "grunge"],
        moods: ["night", "dramatic", "energetic"],
        tags: ["motorcycle", "vehicle", "night", "street"],
        variants: {
            black: { sky: ["#030407", "#111722", "#293548"], glow: "#9bb9d7", subject: "#8993a3", dark: "#020305", accent: "#e34a4e" },
            red: { sky: ["#0e0306", "#3a1014", "#742530"], glow: "#f07479", subject: "#db3347", dark: "#060203", accent: "#ffd166" },
            teal: { sky: ["#02100f", "#0a3334", "#185f64"], glow: "#63c9c5", subject: "#83c7c7", dark: "#020708", accent: "#f4bd64" },
            purple: { sky: ["#0b0615", "#2a1640", "#4b2e69"], glow: "#c59be0", subject: "#9874b5", dark: "#05030a", accent: "#fa8aca" },
        },
    },
    bicycle: {
        label: "vintage bicycle",
        draw: drawBicycle,
        aesthetics: ["nature", "cottagecore", "soft"],
        moods: ["peaceful", "nostalgic", "gentle"],
        tags: ["bicycle", "bike", "vehicle", "outdoors"],
        variants: {
            green: { sky: ["#08190f", "#356345", "#99b88e"], glow: "#d7d69e", subject: "#c9d6bd", dark: "#07100b", accent: "#dcae51" },
            blue: { sky: ["#081522", "#315d80", "#9ac5d8"], glow: "#e9d8a0", subject: "#d3e2e8", dark: "#07101a", accent: "#e3a34f" },
            orange: { sky: ["#251006", "#87502a", "#d9a367"], glow: "#f4db9e", subject: "#e8d2b0", dark: "#160b05", accent: "#c45c35" },
            cream: { sky: ["#352c20", "#93826a", "#e7d8b8"], glow: "#fff2c9", subject: "#f1e5d1", dark: "#211b13", accent: "#8e5e3d" },
        },
    },
    sneaker: {
        label: "detailed sneaker",
        draw: drawSneaker,
        aesthetics: ["grunge", "y2k", "minimalist"],
        moods: ["clean", "energetic", "digital"],
        tags: ["sneaker", "shoe", "fashion", "streetwear"],
        variants: {
            white: { sky: ["#111521", "#394a62"], glow: "#b8d3ec", subject: "#ebedf0", dark: "#080a10", accent: "#47c2d0" },
            black: { sky: ["#08080b", "#282833"], glow: "#9d9dac", subject: "#c1c2ca", dark: "#030305", accent: "#ed4056" },
            red: { sky: ["#17070b", "#5a1824"], glow: "#f29691", subject: "#df4350", dark: "#090305", accent: "#ffd166" },
            pink: { sky: ["#210d1c", "#713952"], glow: "#f4b4d2", subject: "#f0c4d9", dark: "#10060d", accent: "#b87ae3" },
        },
    },
    camera: {
        label: "vintage camera",
        draw: drawCamera,
        aesthetics: ["monochrome", "minimalist", "luxury"],
        moods: ["nostalgic", "clean", "classical"],
        tags: ["camera", "photography", "object", "vintage"],
        variants: {
            black: { sky: ["#090b10", "#293341"], glow: "#a6bfce", subject: "#a7adb3", dark: "#06070a", accent: "#d6ac64" },
            brown: { sky: ["#1a100a", "#5a3b24"], glow: "#ddb47d", subject: "#d0b188", dark: "#0d0805", accent: "#f0d7a2" },
            cream: { sky: ["#25221b", "#88806a"], glow: "#f1e1b5", subject: "#e7ddc9", dark: "#14120e", accent: "#a16e49" },
            teal: { sky: ["#031414", "#17605d"], glow: "#97d9c6", subject: "#c2d9d2", dark: "#020909", accent: "#e4bd70" },
        },
    },
    headphones: {
        label: "studio headphones",
        draw: drawHeadphones,
        aesthetics: ["cyber", "minimalist", "y2k"],
        moods: ["digital", "clean", "energetic"],
        tags: ["headphones", "music", "audio", "object"],
        variants: {
            black: { sky: ["#050609", "#242733"], glow: "#a2aab9", subject: "#bfc5d0", dark: "#030406", accent: "#8f72f0" },
            purple: { sky: ["#0d0718", "#3d1c63"], glow: "#cda4f0", subject: "#e2d3f0", dark: "#07040e", accent: "#f370cf" },
            blue: { sky: ["#04101f", "#174471"], glow: "#9fd2f5", subject: "#d7e9f4", dark: "#030810", accent: "#55e0ed" },
            pink: { sky: ["#1d0a17", "#763451"], glow: "#f4b1d0", subject: "#f2d5e0", dark: "#10050d", accent: "#ffd166" },
        },
    },
    vinyl: {
        label: "vinyl record player",
        draw: drawVinyl,
        aesthetics: ["monochrome", "dark", "minimalist"],
        moods: ["nostalgic", "calm", "classical"],
        tags: ["vinyl", "record", "music", "turntable"],
        variants: {
            black: { sky: ["#08090d", "#292b34"], glow: "#aab1bf", subject: "#aeb4bf", dark: "#030406", accent: "#d8a85e" },
            red: { sky: ["#18070a", "#69202b"], glow: "#ec8d8a", subject: "#e3a3a0", dark: "#090305", accent: "#f4cf77" },
            blue: { sky: ["#06101c", "#234b70"], glow: "#96c1de", subject: "#c8d8e3", dark: "#03070d", accent: "#e3b764" },
            purple: { sky: ["#100817", "#49315f"], glow: "#c4a4d6", subject: "#ded1e8", dark: "#07040b", accent: "#f0c78a" },
        },
    },
    coffee: {
        label: "coffee shop moment",
        draw: drawCoffee,
        aesthetics: ["cottagecore", "soft", "minimalist"],
        moods: ["warm", "calm", "nostalgic"],
        tags: ["coffee", "cafe", "drink", "cozy"],
        variants: {
            brown: { sky: ["#1b1009", "#624125"], glow: "#dba96f", subject: "#e3d0b4", dark: "#100905", accent: "#c7834d" },
            cream: { sky: ["#34271d", "#a88663"], glow: "#f5d8a4", subject: "#fff0d6", dark: "#1d150f", accent: "#ae7049" },
            pink: { sky: ["#28111a", "#84445d"], glow: "#f2b5c4", subject: "#f4e3df", dark: "#14080d", accent: "#d37c98" },
            green: { sky: ["#0c1a11", "#416b4a"], glow: "#d3cf9b", subject: "#e8e2c7", dark: "#070e09", accent: "#b98753" },
        },
    },
};

const THEME_NAMES = Object.keys(THEMES);

/* --- catalog ------------------------------------------------------- */

function buildThemeEntry(id, themeName, colorName, format) {
    const theme = THEMES[themeName];
    const extension = format === "jpg" ? "jpg" : "png";

    return {
        id,

        assets: {
            pfp: `${id} pfp.${extension}`,
            banner: `${id} banner.${extension}`,
        },

        aesthetics: theme.aesthetics.slice(0, 3),
        moods: theme.moods.slice(0, 3),
        colors: [colorName],

        /*
         * The subject is the useful search term here — "moon", "roses",
         * "skyline" — and no tagger could infer it from pixels, so it is
         * carried as curated metadata the tagger merges into `tags`.
         */
        curatedTags: [...theme.tags, `theme-${themeName}`],

        premium: false,

        license: {
            kind: "generated",
            source: `procedural:theme-${themeName}`,
            author: "Aesthetic King",
            commercialUse: true,
            notes: `Rendered by scripts/generateThemeAssets.js (theme "${theme.label}").`,
        },

        enabled: true,
    };
}

/* --- driver -------------------------------------------------------- */

function parseArgs(argv) {
    const options = {
        count: THEME_NAMES.length,
        seed: null,
        themes: THEME_NAMES,
        colors: null,
        startId: 2000,
        out: OUTPUT_DIR,
        format: "png",
        dryRun: false,
    };

    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[++i];

        switch (arg) {
            case "--count":
                options.count = Math.max(1, parseInt(next(), 10) || 1);
                break;
            case "--seed":
                options.seed = parseInt(next(), 10);
                break;
            case "--themes":
                options.themes = next()
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => THEMES[s]);
                break;
            case "--colors":
                options.colors = next()
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                break;
            case "--start-id":
                options.startId = parseInt(next(), 10) || 2000;
                break;
            case "--out":
                options.out = path.resolve(next());
                break;
            case "--format": {
                const format = next().toLowerCase();

                if (!["png", "jpg"].includes(format)) {
                    throw new Error(`Unsupported format "${format}". Use png or jpg.`);
                }

                options.format = format;
                break;
            }
            case "--dry-run":
                options.dryRun = true;
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }

    if (options.themes.length === 0) {
        throw new Error(`No valid themes selected. Known: ${THEME_NAMES.join(", ")}`);
    }

    return options;
}

function generate() {
    const options = parseArgs(process.argv);
    const seed = Number.isFinite(options.seed) ? options.seed : Math.floor(Math.random() * 1e9);
    const random = makeRandom(seed);

    logger.info(`Generating ${options.count} themed set(s) from seed ${seed}.`);

    if (!options.dryRun) {
        fs.mkdirSync(options.out, { recursive: true });
    }

    const entries = [];
    const plan = [];

    for (let i = 0; i < options.count; i += 1) {
        const id = String(options.startId + i);
        const themeName = options.themes[i % options.themes.length];
        const theme = THEMES[themeName];

        /*
         * A theme only knows the colour variants it declares, so a
         * requested colour with no variant for this theme falls back to
         * the theme's own list rather than rendering the wrong subject in
         * the wrong colours.
         */
        const available = Object.keys(theme.variants);
        const allowed = options.colors ? available.filter((c) => options.colors.includes(c)) : available;
        const colorName = pick(random, allowed.length ? allowed : available);
        const variant = theme.variants[colorName];

        plan.push({ id, themeName, colorName });

        if (options.dryRun) {
            continue;
        }

        for (const [type, width, height] of [
            ["pfp", PFP_SIZE, PFP_SIZE],
            ["banner", BANNER_WIDTH, BANNER_HEIGHT],
        ]) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext("2d");

            theme.draw(ctx, width, height, variant, random);

            const extension = options.format === "jpg" ? "jpg" : "png";
            const mimeType = options.format === "jpg" ? "image/jpeg" : "image/png";
            const buffer = options.format === "jpg"
                ? canvas.toBuffer(mimeType, { quality: 0.96 })
                : canvas.toBuffer(mimeType);

            fs.writeFileSync(path.join(options.out, `${id} ${type}.${extension}`), buffer);
        }

        entries.push(buildThemeEntry(id, themeName, colorName, options.format));
    }

    if (options.dryRun) {
        console.log("");
        console.log("Dry run — nothing written.");
        console.log("");

        for (const item of plan) {
            console.log(`  ${item.id}  ${THEMES[item.themeName].label.padEnd(20)} ${item.colorName}`);
        }

        return;
    }

    fs.writeFileSync(
        path.join(options.out, "catalog.json"),
        `${JSON.stringify(entries, null, 2)}\n`
    );

    logger.success(`Wrote ${entries.length * 2} images and catalog.json to ${options.out}`);

    console.log("");
    console.log("Next steps:");
    console.log(`  1. Upload ${options.out}\\*.${options.format} to R2 keeping the file names.`);
    console.log("  2. Merge catalog.json into src/data/assetCatalog.json, then run:");
    console.log("       node scripts/tagAssetCatalog.js");
    console.log("       node scripts/auditAssetLicenses.js");
}

if (require.main === module) {
    try {
        generate();
    } catch (error) {
        logger.error("Theme asset generation failed.", error);
        process.exit(1);
    }
}

module.exports = { THEMES, THEME_NAMES, buildThemeEntry };
