/*
 * Generates original pfp/banner sets with node-canvas.
 *
 * Why this exists: the library used to be filled by hand from images
 * found online, and every one of those is a photo or illustration
 * somebody else owns. The bot rehosts them in R2 and renders them into
 * cards users download, which is reproduction, distribution and public
 * display — all rights the original holder never granted us. Doing that
 * behind a paywall removes the only argument that usually saves a
 * small project.
 *
 * Everything this script writes is derived from math we chose, so we own
 * it outright, there is no attribution debt, and the library can grow to
 * any size without anyone hunting for images.
 *
 * Output:
 *   generated-assets/<id> pfp.png      upload these to R2 with the key
 *   generated-assets/<id> banner.png   "<id> pfp.png" / "<id> banner.png"
 *   generated-assets/catalog.json      entries to merge into
 *                                      src/data/assetCatalog.json
 *
 * Usage:
 *   node scripts/generateProceduralAssets.js --count 24
 *   node scripts/generateProceduralAssets.js --count 8 --seed 42 --styles mesh,duotone
 *   node scripts/generateProceduralAssets.js --count 4 --dry-run
 */

const fs = require("fs");
const path = require("path");

const { createCanvas } = require("canvas");

const logger = require("../src/utils/logger");

const OUTPUT_DIR = path.join(__dirname, "..", "generated-assets");

const PFP_SIZE = 1024;
const BANNER_WIDTH = 1920;
const BANNER_HEIGHT = 1080;

/*
 * Named palettes keyed by the color vocabulary already used in
 * assetCatalog.json, so a generated set can be tagged with colors the
 * Studio's filters already understand. Each palette is [deep, mid,
 * accent, light] ordered dark to light.
 */
const PALETTES = {
    black: { hexes: ["#08080a", "#16161c", "#2c2c38", "#5a5a6e"], aesthetics: ["dark", "monochrome"], moods: ["moody", "dark"] },
    blue: { hexes: ["#050d1f", "#0d2a52", "#1f5f9e", "#7fb6e8"], aesthetics: ["nature", "minimalist"], moods: ["calm", "night"] },
    brown: { hexes: ["#1c1109", "#402616", "#7a4b2a", "#c08a55"], aesthetics: ["cottagecore", "grunge"], moods: ["warm", "nostalgic"] },
    cream: { hexes: ["#b9a68a", "#dccbb0", "#eee2cd", "#fbf6ec"], aesthetics: ["soft", "minimalist"], moods: ["gentle", "clean"] },
    gold: { hexes: ["#241703", "#6b4708", "#b8860b", "#f0c65a"], aesthetics: ["luxury", "romantic"], moods: ["elegant", "warm"] },
    gray: { hexes: ["#101114", "#2e3238", "#5c626c", "#a3a9b3"], aesthetics: ["minimalist", "monochrome"], moods: ["minimal", "clean"] },
    green: { hexes: ["#04140c", "#0d3d24", "#1f7a48", "#6fd39a"], aesthetics: ["nature", "cottagecore"], moods: ["peaceful", "atmospheric"] },
    indigo: { hexes: ["#070722", "#1a1a56", "#37379e", "#7d7de8"], aesthetics: ["dreamcore", "cyber"], moods: ["night", "mysterious"] },
    orange: { hexes: ["#240d02", "#7a2c05", "#d15c12", "#ffa14d"], aesthetics: ["grunge", "nature"], moods: ["energetic", "warm"] },
    pink: { hexes: ["#2b0a1a", "#7a1f47", "#d1467f", "#ffa3c4"], aesthetics: ["soft", "romantic"], moods: ["soft", "dreamy"] },
    purple: { hexes: ["#12061f", "#3a1466", "#6d2fa8", "#b478e8"], aesthetics: ["dark", "dreamcore"], moods: ["mysterious", "ethereal"] },
    red: { hexes: ["#1c0306", "#630a13", "#b01726", "#f0576a"], aesthetics: ["gothic", "horror"], moods: ["dramatic", "intense"] },
    teal: { hexes: ["#03181a", "#0a4a4f", "#12898f", "#5fd8dc"], aesthetics: ["nature", "cyber"], moods: ["calm", "digital"] },
    white: { hexes: ["#8f939c", "#c3c7cf", "#e6e9ee", "#ffffff"], aesthetics: ["minimalist", "monochrome"], moods: ["clean", "minimal"] },
    yellow: { hexes: ["#241c02", "#7a5e06", "#c9a20d", "#ffe45c"], aesthetics: ["nature", "pastel"], moods: ["bright", "energetic"] },
};

/*
 * Each style declares which of the catalog facets it genuinely produces.
 * A style that renders hard horizontal bands really is "digital", so
 * saying so in the catalog is honest; the tags script then derives the
 * cross-facet tags from these rather than from pixels it cannot see.
 */
const STYLES = {
    mesh: {
        label: "mesh gradient",
        draw: drawMeshGradient,
        aesthetics: ["minimalist", "dreamcore"],
        moods: ["ethereal", "calm"],
        tags: ["soft-blend"],
    },
    aurora: {
        label: "aurora ribbons",
        draw: drawAurora,
        aesthetics: ["dreamcore", "nature"],
        moods: ["ethereal", "atmospheric"],
        tags: ["glow"],
    },
    duotone: {
        label: "duotone grain",
        draw: drawDuotone,
        aesthetics: ["dark", "minimalist"],
        moods: ["moody", "cinematic"],
        tags: ["high-contrast"],
    },
    scanlines: {
        label: "scanline synth",
        draw: drawScanlines,
        aesthetics: ["cyber"],
        moods: ["digital", "neon"],
        tags: ["retro-tech"],
    },
    bokeh: {
        label: "bokeh field",
        draw: drawBokeh,
        aesthetics: ["soft", "romantic"],
        moods: ["dreamy", "night"],
        tags: ["glow", "soft-blend"],
    },
    geometry: {
        label: "arc geometry",
        draw: drawGeometry,
        aesthetics: ["minimalist"],
        moods: ["clean", "minimal"],
        tags: ["structured"],
    },
    rays: {
        label: "radiant bloom",
        draw: drawRays,
        aesthetics: ["luxury", "dreamcore"],
        moods: ["elegant", "bright"],
        tags: ["glow", "symmetry"],
    },
    strata: {
        label: "sediment strata",
        draw: drawStrata,
        aesthetics: ["grunge", "nature"],
        moods: ["nostalgic", "vintage"],
        tags: ["textured", "horizon"],
    },
    ripple: {
        label: "interference ripple",
        draw: drawRipple,
        aesthetics: ["cyber", "dreamcore"],
        moods: ["digital", "mysterious"],
        tags: ["structured", "soft-blend"],
    },
    mist: {
        label: "layered mist",
        draw: drawMist,
        aesthetics: ["gothic", "nature"],
        moods: ["atmospheric", "moody"],
        tags: ["textured", "horizon"],
    },
};

const STYLE_NAMES = Object.keys(STYLES);

/*
 * Deterministic per-set randomness. Reproducibility matters here: with a
 * fixed seed, re-running the script regenerates byte-identical images,
 * so a curator can delete and re-upload a set without the library
 * silently changing under a catalog entry that already points at it.
 */
function makeRandom(seed) {
    let state = seed >>> 0 || 1;

    return function random() {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
    };
}

function pick(random, values) {
    return values[Math.floor(random() * values.length)];
}

function range(random, min, max) {
    return min + random() * (max - min);
}

/*
 * A palette is always read dark-to-light so a style can rely on index 0
 * being its darkest stop. Shuffling the order would put white where the
 * renderer expects near-black and turn half the library into a wash.
 *
 * The accent stop is usually swapped for another palette's accent, which
 * is what stops 15 named colors from producing 15 obvious gradients. The
 * swapped color is reported alongside the base so the catalog's `colors`
 * facet describes the image that was actually rendered rather than the
 * palette it started from.
 */
function buildPalette(random, colorName) {
    const base = PALETTES[colorName];
    const hexes = [...base.hexes];

    const otherNames = Object.keys(PALETTES).filter((name) => name !== colorName);
    const partnerName = pick(random, otherNames);
    const partner = PALETTES[partnerName];

    const colors = [colorName];

    if (random() < 0.7) {
        hexes[2] = partner.hexes[2];
        colors.push(partnerName);
    }

    if (random() < 0.4) {
        hexes[1] = partner.hexes[1];

        if (!colors.includes(partnerName)) {
            colors.push(partnerName);
        }
    }

    return { hexes, colorName, colors };
}

function toRgb(hex) {
    const clean = hex.replace("#", "");

    return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
    };
}

function rgba(hex, alpha) {
    const { r, g, b } = toRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(hexA, hexB, amount) {
    const a = toRgb(hexA);
    const b = toRgb(hexB);

    const channel = (x, y) =>
        Math.round(x + (y - x) * amount)
            .toString(16)
            .padStart(2, "0");

    return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`;
}

function fillBase(ctx, width, height, hex) {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, width, height);
}

/*
 * Adds film grain. Kept subtle (a few percent of luminance) because the
 * profile card downsamples banners heavily, and heavy grain turns into
 * visible mush at that scale.
 */
/*
 * Grain strength is expressed as a fraction of canvas height rather than
 * an absolute luminance delta. At 1080px tall, a fixed ±26 looked like
 * film; the same value on a 1024px pfp is coarse enough to read as a
 * compression artefact once Discord downscales it to 128px.
 */
function grainStrength(height, fraction) {
    return height * fraction;
}

function addGrain(ctx, width, height, random, fraction) {
    const strength = grainStrength(height, fraction);
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;

    for (let i = 0; i < data.length; i += 4) {
        const noise = (random() - 0.5) * strength;

        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }

    ctx.putImageData(image, 0, 0);
}

/*
 * Vignette. The profile card clips banners into a wide short strip, so a
 * darker edge keeps the centre readable once the username overlay sits
 * on top of it.
 */
function addVignette(ctx, width, height, strength) {
    const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.25,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.75
    );

    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${strength})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

/*
 * Pushes an opaque grayscale field sitting on the canvas through a colour
 * ramp. Doing the mapping per pixel (instead of with blend modes) is what
 * makes a duotone read as a duotone: `multiply` + `lighten` only clamps the
 * extremes and leaves every mid-tone a desaturated mud, and tinting with
 * `color` keeps the field's luminance and comes out milky.
 *
 * `contrast` is an S-curve amount; 0 is linear and ~1.2 is punchy.
 */
function gradientMap(ctx, width, height, stops, contrast) {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;

    const ramp = stops.map((hex) => {
        const clean = hex.replace("#", "");
        return [
            parseInt(clean.slice(0, 2), 16),
            parseInt(clean.slice(2, 4), 16),
            parseInt(clean.slice(4, 6), 16)
        ];
    });

    const lut = new Uint8ClampedArray(ramp.length * 256 * 3);
    for (let i = 0; i < 256; i += 1) {
        let t = i / 255;
        if (contrast > 0) {
            t = Math.min(1, Math.max(0, (t - 0.5) * (1 + contrast) + 0.5));
        }

        const scaled = t * (ramp.length - 1);
        const index = Math.min(ramp.length - 2, Math.floor(scaled));
        const frac = scaled - index;
        const a = ramp[index];
        const b = ramp[index + 1];

        for (let channel = 0; channel < 3; channel += 1) {
            lut[i * 3 + channel] = a[channel] + (b[channel] - a[channel]) * frac;
        }
    }

    for (let i = 0; i < data.length; i += 4) {
        const source = data[i];
        data[i] = lut[source * 3];
        data[i + 1] = lut[source * 3 + 1];
        data[i + 2] = lut[source * 3 + 2];
    }

    ctx.putImageData(image, 0, 0);
}

function radialBlob(ctx, x, y, radius, hex, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, rgba(hex, alpha));
    gradient.addColorStop(1, rgba(hex, 0));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

/* --- styles ------------------------------------------------------- */

function drawMeshGradient(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const count = Math.round(range(random, 5, 9));

    for (let i = 0; i < count; i += 1) {
        const hex = palette.hexes[Math.min(palette.hexes.length - 1, 1 + Math.floor(random() * (palette.hexes.length - 1)))];

        radialBlob(
            ctx,
            range(random, -0.15, 1.15) * width,
            range(random, -0.15, 1.15) * height,
            range(random, 0.35, 0.85) * Math.max(width, height),
            hex,
            range(random, 0.35, 0.8)
        );
    }

    ctx.save();
    ctx.filter = `blur(${Math.round(Math.max(width, height) * 0.035)}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
}

function drawAurora(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const bands = Math.round(range(random, 3, 6));

    for (let band = 0; band < bands; band += 1) {
        const hex = palette.hexes[1 + (band % (palette.hexes.length - 1))];
        const baseline = range(random, 0.2, 0.85) * height;
        const amplitude = range(random, 0.05, 0.22) * height;
        const thickness = range(random, 0.05, 0.2) * height;
        const phase = random() * Math.PI * 2;
        const frequency = range(random, 1.2, 3.2);

        ctx.save();
        ctx.filter = `blur(${Math.round(Math.max(width, height) * 0.02)}px)`;
        ctx.globalCompositeOperation = "lighter";

        ctx.beginPath();

        for (let x = 0; x <= width; x += 8) {
            const t = x / width;
            const y =
                baseline +
                Math.sin(t * Math.PI * frequency + phase) * amplitude +
                Math.sin(t * Math.PI * frequency * 2.3 + phase) * amplitude * 0.3;

            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        for (let x = width; x >= 0; x -= 8) {
            const t = x / width;
            const y =
                baseline +
                Math.sin(t * Math.PI * frequency + phase) * amplitude +
                thickness;

            ctx.lineTo(x, y);
        }

        ctx.closePath();
        ctx.fillStyle = rgba(hex, range(random, 0.25, 0.55));
        ctx.fill();
        ctx.restore();
    }

    radialBlob(
        ctx,
        range(random, 0.2, 0.8) * width,
        range(random, 0.1, 0.5) * height,
        Math.max(width, height) * 0.5,
        palette.hexes[3],
        0.22
    );
}

function drawDuotone(ctx, width, height, palette, random) {
    /*
     * A value field is built in grayscale, blurred, then pushed through a
     * four-stop ramp built from the palette. The mid stop is the accent,
     * which is what gives the style its colour punch; without it the two
     * outer stops alone produce a flat wash.
     */
    fillBase(ctx, width, height, "#000000");

    const blobs = Math.round(range(random, 5, 9));

    for (let i = 0; i < blobs; i += 1) {
        radialBlob(
            ctx,
            range(random, 0, 1) * width,
            range(random, 0, 1) * height,
            range(random, 0.2, 0.6) * Math.max(width, height),
            "#ffffff",
            range(random, 0.3, 0.85)
        );
    }

    ctx.save();
    ctx.filter = `blur(${Math.round(Math.max(width, height) * 0.03)}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();

    const stops = [
        palette.hexes[0],
        mix(palette.hexes[0], palette.hexes[2], 0.55),
        mix(palette.hexes[2], palette.hexes[3], 0.4),
        palette.hexes[3]
    ];

    gradientMap(ctx, width, height, stops, range(random, 0.7, 1.3));

    addGrain(ctx, width, height, random, 0.011);
    addVignette(ctx, width, height, 0.22);
}

function drawScanlines(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, rgba(palette.hexes[1], 0.9));
    gradient.addColorStop(0.55, rgba(palette.hexes[2], 0.55));
    gradient.addColorStop(1, rgba(palette.hexes[0], 0.95));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const sunY = range(random, 0.3, 0.6) * height;
    const sunR = range(random, 0.18, 0.34) * Math.min(width, height);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    radialBlob(ctx, width * range(random, 0.3, 0.7), sunY, sunR * 2.4, palette.hexes[3], 0.5);
    ctx.fillStyle = rgba(palette.hexes[3], 0.85);
    ctx.beginPath();
    ctx.arc(width * 0.5, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /*
     * Horizontal scanlines plus a perspective floor grid: the two cues
     * that read as "synth" instantly, and both survive the banner crop.
     */
    const step = Math.max(3, Math.round(height / range(random, 90, 160)));

    ctx.save();
    ctx.globalAlpha = range(random, 0.1, 0.22);
    ctx.fillStyle = palette.hexes[0];

    for (let y = 0; y < height; y += step) {
        ctx.fillRect(0, y, width, step * 0.5);
    }

    ctx.restore();

    const horizon = sunY + sunR * range(random, 0.4, 1.1);

    ctx.save();
    ctx.strokeStyle = rgba(palette.hexes[3], 0.4);
    ctx.lineWidth = Math.max(1, width / 900);

    for (let i = 1; i <= 14; i += 1) {
        const t = i / 14;
        const y = horizon + (height - horizon) * t * t;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    for (let i = -12; i <= 12; i += 1) {
        ctx.beginPath();
        ctx.moveTo(width / 2 + i * (width / 12), height);
        ctx.lineTo(width / 2 + i * (width / 60), horizon);
        ctx.stroke();
    }

    ctx.restore();
}

function drawBokeh(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const diagonal = Math.hypot(width, height);
    const count = Math.round(range(random, 26, 55));

    for (let i = 0; i < count; i += 1) {
        const hex = palette.hexes[1 + Math.floor(random() * (palette.hexes.length - 1))];
        const radius = range(random, 0.02, 0.16) * diagonal;
        const x = range(random, -0.1, 1.1) * width;
        const y = range(random, -0.1, 1.1) * height;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = `blur(${Math.max(2, Math.round(radius * range(random, 0.1, 0.45)))}px)`;

        ctx.fillStyle = rgba(hex, range(random, 0.06, 0.3));
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (random() < 0.35) {
            ctx.strokeStyle = rgba(hex, range(random, 0.1, 0.3));
            ctx.lineWidth = Math.max(1, radius * 0.06);
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.92, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    addVignette(ctx, width, height, 0.45);
}

function drawGeometry(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[3]);

    const cx = range(random, 0.25, 0.75) * width;
    const cy = range(random, 0.3, 0.7) * height;
    const rings = Math.round(range(random, 5, 11));
    const maxR = Math.max(width, height) * range(random, 0.45, 0.8);
    const direction = random() < 0.5 ? 1 : -1;

    for (let i = rings; i >= 1; i -= 1) {
        const t = i / rings;
        const radius = maxR * t;
        const hex = mix(palette.hexes[0], palette.hexes[2], 1 - t);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();

        fillBase(ctx, width, height, hex);
        ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "overlay";

    const wedges = Math.round(range(random, 3, 7));

    for (let i = 0; i < wedges; i += 1) {
        const start = random() * Math.PI * 2 * direction;
        const sweep = range(random, 0.25, 1.1);

        ctx.fillStyle = rgba(palette.hexes[i % palette.hexes.length], range(random, 0.2, 0.5));
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, maxR * range(random, 0.4, 1), start, start + sweep);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();

    ctx.save();
    ctx.strokeStyle = rgba(palette.hexes[0], 0.35);
    ctx.lineWidth = Math.max(1, width / 700);

    for (let i = 1; i <= rings; i += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, (maxR * i) / rings, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawRays(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const cx = width * range(random, 0.4, 0.6);
    const cy = height * range(random, 0.35, 0.65);
    const rayCount = Math.round(range(random, 18, 44));
    const length = Math.hypot(width, height);
    const spread = range(random, 0.03, 0.12);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < rayCount; i += 1) {
        const angle = (i / rayCount) * Math.PI * 2 + range(random, -0.02, 0.02);
        const hex = palette.hexes[2 + (i % 2)];

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.filter = `blur(${Math.round(length * 0.006)}px)`;

        const gradient = ctx.createLinearGradient(0, 0, length, 0);
        gradient.addColorStop(0, rgba(hex, 0.5));
        gradient.addColorStop(1, rgba(hex, 0));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, -length * spread);
        ctx.lineTo(length, length * spread);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();

    radialBlob(ctx, cx, cy, length * 0.22, palette.hexes[3], 0.85);
    radialBlob(ctx, cx, cy, length * 0.5, palette.hexes[2], 0.3);

    addVignette(ctx, width, height, 0.5);
}

function drawStrata(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const layers = Math.round(range(random, 6, 12));
    const amplitude = range(random, 0.02, 0.07) * height;

    for (let i = 0; i < layers; i += 1) {
        const t = i / (layers - 1);
        const baseY = height * (0.18 + t * 0.85);
        const hex = mix(palette.hexes[0], palette.hexes[3], t);
        const phase = random() * Math.PI * 2;
        const frequency = range(random, 1, 3.5);

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 6) {
            const u = x / width;
            const y =
                baseY +
                Math.sin(u * Math.PI * frequency + phase) * amplitude +
                Math.sin(u * Math.PI * frequency * 3.1 + phase) * amplitude * 0.35;

            ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        ctx.fillStyle = hex;
        ctx.fill();
    }

    radialBlob(
        ctx,
        range(random, 0.15, 0.85) * width,
        height * range(random, 0.05, 0.25),
        Math.max(width, height) * 0.4,
        palette.hexes[3],
        0.3
    );

    addGrain(ctx, width, height, random, 0.012);
}

function drawRipple(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    /*
     * Two wave sources interfere with each other. Computed per pixel
     * rather than drawn as rings, which is what produces the moiré that
     * makes the style look generated rather than drawn.
     */
    /*
     * The field is computed at a fraction of the output size and scaled
     * up. That is deliberate: the moiré the two wave sources produce at
     * full resolution is aliasing rather than texture, and it shatters
     * into per-pixel noise when the banner is cropped. Rendering small
     * and letting the scaler interpolate keeps the interference pattern
     * readable.
     */
    const scale = 0.12;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const field = createCanvas(w, h);
    const fctx = field.getContext("2d");
    const image = fctx.createImageData(w, h);

    const ax = range(random, 0.2, 0.8);
    const ay = range(random, 0.2, 0.8);
    const bx = range(random, 0.2, 0.8);
    const by = range(random, 0.2, 0.8);
    const freq = range(random, 6, 14);
    const phase = random() * Math.PI * 2;

    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const ux = x / w;
            const uy = y / h;

            const da = Math.hypot(ux - ax, uy - ay);
            const db = Math.hypot(ux - bx, uy - by);

            const v =
                (Math.sin(da * freq + phase) + Math.sin(db * freq * 1.13)) / 2;

            const t = (v + 1) / 2;
            const index = (y * w + x) * 4;
            const rgb = toRgb(mix(palette.hexes[0], palette.hexes[3], t));

            image.data[index] = rgb.r;
            image.data[index + 1] = rgb.g;
            image.data[index + 2] = rgb.b;
            image.data[index + 3] = 255;
        }
    }

    fctx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field, 0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    fillBase(ctx, width, height, palette.hexes[2]);
    ctx.restore();

    radialBlob(ctx, width * ax, height * ay, Math.max(width, height) * 0.35, palette.hexes[3], 0.3);

    addGrain(ctx, width, height, random, 0.008);
}

function drawMist(ctx, width, height, palette, random) {
    fillBase(ctx, width, height, palette.hexes[0]);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, rgba(palette.hexes[1], 0.85));
    sky.addColorStop(0.6, rgba(palette.hexes[0], 0.4));
    sky.addColorStop(1, rgba(palette.hexes[0], 0.95));

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const ridges = Math.round(range(random, 3, 6));

    for (let i = 0; i < ridges; i += 1) {
        const t = i / Math.max(1, ridges - 1);
        const baseY = height * (0.45 + t * 0.4);
        const amplitude = range(random, 0.04, 0.14) * height;
        const phase = random() * Math.PI * 2;
        const frequency = range(random, 1.2, 3);

        ctx.beginPath();
        ctx.moveTo(0, height);

        for (let x = 0; x <= width; x += 8) {
            const u = x / width;
            const y =
                baseY +
                Math.sin(u * Math.PI * frequency + phase) * amplitude +
                Math.sin(u * Math.PI * frequency * 2.7 + phase) * amplitude * 0.3;

            ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();

        ctx.fillStyle = mix(palette.hexes[0], palette.hexes[1], 1 - t);
        ctx.fill();

        /*
         * Fog band above each ridge. The blur is what separates "hills"
         * from "mountains in mist", which is the whole point of the
         * style.
         */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = `blur(${Math.round(height * 0.03)}px)`;
        ctx.fillStyle = rgba(palette.hexes[3], 0.1);
        ctx.fillRect(0, baseY - amplitude, width, amplitude * 2.4);
        ctx.restore();
    }

    /*
     * The sun is a wide, low-alpha glow rather than a tight bright blob.
     * A short radius with high alpha quantises into visible concentric
     * banding on light palettes, which reads as an artefact rather than
     * as haze.
     */
    radialBlob(
        ctx,
        range(random, 0.2, 0.8) * width,
        height * 0.2,
        Math.max(width, height) * 0.75,
        palette.hexes[3],
        0.2
    );

    addGrain(ctx, width, height, random, 0.01);
}

/* --- catalog ------------------------------------------------------ */

function buildCatalogEntry(id, styleName, palette) {
    const style = STYLES[styleName];

    const aesthetics = [...new Set([...style.aesthetics, ...PALETTES[palette.colorName].aesthetics])].slice(0, 3);
    const moods = [...new Set([...style.moods, ...PALETTES[palette.colorName].moods])].slice(0, 3);

    return {
        id,

        assets: {
            pfp: `${id} pfp.png`,
            banner: `${id} banner.png`,
        },

        aesthetics,
        moods,
        colors: palette.colors.length ? palette.colors : [palette.colorName],

        /*
         * The render style is a fact about the pixels, not something the
         * aesthetics/moods/colors facets can imply, so it is carried
         * separately and merged into `tags` by the tagger.
         */
        curatedTags: [...style.tags, `style-${styleName}`],

        premium: false,

        /*
         * Written by our own renderer from math, with no third-party
         * input of any kind, so there is nothing to attribute and no
         * restriction on selling access to it.
         */
        license: {
            kind: "generated",
            source: `procedural:${styleName}`,
            author: "Aesthetic King",
            commercialUse: true,
            notes: `Rendered by scripts/generateProceduralAssets.js (style "${style.label}").`,
        },

        enabled: true,
    };
}

/* --- driver ------------------------------------------------------- */

function parseArgs(argv) {
    const options = {
        count: 12,
        seed: null,
        styles: STYLE_NAMES,
        colors: Object.keys(PALETTES),
        startId: 1000,
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
            case "--styles":
                options.styles = next()
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => STYLE_NAMES.includes(s));
                break;
            case "--colors":
                options.colors = next()
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => PALETTES[s]);
                break;
            case "--start-id":
                options.startId = parseInt(next(), 10) || 1000;
                break;
            case "--dry-run":
                options.dryRun = true;
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }

    if (options.styles.length === 0) {
        throw new Error(`No valid styles selected. Known: ${STYLE_NAMES.join(", ")}`);
    }

    if (options.colors.length === 0) {
        throw new Error(`No valid colors selected. Known: ${Object.keys(PALETTES).join(", ")}`);
    }

    return options;
}

function generate() {
    const options = parseArgs(process.argv);

    /*
     * Without an explicit seed the run is still reproducible from the
     * printed value, so a surprising batch can be regenerated exactly
     * before it is thrown away.
     */
    const seed = Number.isFinite(options.seed) ? options.seed : Math.floor(Math.random() * 1e9);
    const random = makeRandom(seed);

    logger.info(`Generating ${options.count} procedural set(s) from seed ${seed}.`);

    if (!options.dryRun) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const entries = [];
    const plan = [];

    for (let i = 0; i < options.count; i += 1) {
        const id = String(options.startId + i);
        const styleName = options.styles[i % options.styles.length];
        const colorName = options.colors[Math.floor(random() * options.colors.length)];
        const palette = buildPalette(random, colorName);

        plan.push({ id, styleName, colorName });

        if (options.dryRun) {
            continue;
        }

        for (const [type, width, height] of [
            ["pfp", PFP_SIZE, PFP_SIZE],
            ["banner", BANNER_WIDTH, BANNER_HEIGHT],
        ]) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext("2d");

            STYLES[styleName].draw(ctx, width, height, palette, random);

            fs.writeFileSync(
                path.join(OUTPUT_DIR, `${id} ${type}.png`),
                canvas.toBuffer("image/png")
            );
        }

        entries.push(buildCatalogEntry(id, styleName, palette));
    }

    if (options.dryRun) {
        console.log("");
        console.log("Dry run — nothing written.");
        console.log("");

        for (const item of plan) {
            console.log(`  ${item.id}  ${STYLES[item.styleName].label.padEnd(22)} ${item.colorName}`);
        }

        return;
    }

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "catalog.json"),
        `${JSON.stringify(entries, null, 2)}\n`
    );

    logger.success(`Wrote ${entries.length * 2} images and catalog.json to ${OUTPUT_DIR}`);

    console.log("");
    console.log("Next steps:");
    console.log(`  1. Upload ${OUTPUT_DIR}\\*.png to R2 keeping the file names.`);
    console.log("  2. Merge catalog.json into src/data/assetCatalog.json, then run:");
    console.log("       node scripts/tagAssetCatalog.js");
    console.log("       node scripts/auditAssetLicenses.js");
}

/*
 * Only run the CLI when this file is executed directly. The theme
 * generator requires these primitives and palettes rather than
 * duplicating them, and a bare `require` must not start a render.
 */
if (require.main === module) {
    try {
        generate();
    } catch (error) {
        logger.error("Procedural asset generation failed.", error);
        process.exit(1);
    }
}

module.exports = {
    PALETTES,
    STYLES,
    STYLE_NAMES,
    PFP_SIZE,
    BANNER_WIDTH,
    BANNER_HEIGHT,
    makeRandom,
    pick,
    range,
    buildPalette,
    toRgb,
    rgba,
    mix,
    fillBase,
    addGrain,
    addVignette,
    gradientMap,
    radialBlob,
    buildCatalogEntry,
};
