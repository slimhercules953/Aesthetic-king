#!/usr/bin/env node

/*
 * Guards the shared Studio bridge embed formatting.
 *
 *   node scripts/testBridgeEmbeds.js
 *
 * Two things here were shipped broken once and are cheap to break again:
 * palette swatches rendered as a row of identical red squares regardless of
 * the actual colours, and STUDIO_URL pointing at a LAN address leaked a
 * machine-only link into embeds other people read. Both are pure functions,
 * so they are checked directly instead of through a live command.
 */

require("dotenv").config();

const {
    formatPalette,
    swatchFor,
    studioFooterLink,
} = require("../src/components/embeds/bridge");

const {
    buildStudioLink,
} = require("../src/components/embeds/premiumLocked");

/*
 * Required once, up front, and reused: the embed helpers hold their own
 * reference to this exact object, so it is the one that has to be mutated to
 * exercise the "link configured" branch.
 */
const config = require("../src/config/env");

const ENV_PATH = require.resolve("../src/config/env");

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`  \u2713 ${name}`);
    } else {
        failed += 1;
        console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ""}`);
    }
}

function section(title) {
    console.log(`\n${title}`);
}

/*
 * Reads config.env with the given variables applied, then restores the real
 * environment. The module caches its values at require time, so the cache has
 * to be dropped for each case.
 */
function resolveStudioUrl(studioUrl, appUrl, allowPrivate) {
    const original = {
        STUDIO_URL: process.env.STUDIO_URL,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        STUDIO_URL_ALLOW_PRIVATE: process.env.STUDIO_URL_ALLOW_PRIVATE,
    };

    const apply = (name, value) => {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    };

    apply("STUDIO_URL", studioUrl);
    apply("NEXT_PUBLIC_APP_URL", appUrl);
    apply(
        "STUDIO_URL_ALLOW_PRIVATE",
        allowPrivate ? "true" : undefined
    );

    delete require.cache[ENV_PATH];

    let url;

    try {
        url = require(ENV_PATH).studio.url;
    } finally {
        delete require.cache[ENV_PATH];

        for (const [name, value] of Object.entries(original)) {
            apply(name, value);
        }
    }

    return url;
}

section("swatchFor maps a colour to the matching square");

check("red is red", swatchFor("#ff0000") === "\u{1F7E5}", swatchFor("#ff0000"));
check("orange is orange", swatchFor("#ff9800") === "\u{1F7E7}", swatchFor("#ff9800"));
check("yellow is yellow", swatchFor("#ffeb3b") === "\u{1F7E8}", swatchFor("#ffeb3b"));
check("green is green", swatchFor("#2ecc71") === "\u{1F7E9}", swatchFor("#2ecc71"));
check("blue is blue", swatchFor("#2b6cb0") === "\u{1F7E6}", swatchFor("#2b6cb0"));
check("purple is purple", swatchFor("#7c5cff") === "\u{1F7EA}", swatchFor("#7c5cff"));
/*
 * Hue 330 is magenta, which sits nearer Discord's purple square than its red
 * one; only past 345 does it wrap round to red.
 */
check("magenta leans purple", swatchFor("#ff2d95") === "\u{1F7EA}", swatchFor("#ff2d95"));
check("crimson wraps back to red", swatchFor("#dc143c") === "\u{1F7E5}", swatchFor("#dc143c"));
check("near-black is black", swatchFor("#0a0a0a") === "\u2B1B", swatchFor("#0a0a0a"));
check("pure black is black", swatchFor("#000000") === "\u2B1B", swatchFor("#000000"));
check("white is white", swatchFor("#ffffff") === "\u2B1C", swatchFor("#ffffff"));
/*
 * There is no grey square emoji, so greys are split by lightness: a light
 * grey reads as ⬜ and a dark one as ⬛.
 */
check("dark grey is black", swatchFor("#2b2d31") === "\u2B1B", swatchFor("#2b2d31"));
check("light grey is white", swatchFor("#c9cccf") === "\u2B1C", swatchFor("#c9cccf"));
check("brown is brown", swatchFor("#5c3a1e") === "\u{1F7EB}", swatchFor("#5c3a1e"));

check(
    "a blue palette does not read as red",
    swatchFor("#1a73e8") !== "\u{1F7E5}",
    swatchFor("#1a73e8")
);

check(
    "shades of one hue share a square",
    swatchFor("#0e6ba8") === swatchFor("#5db3ff"),
    `${swatchFor("#0e6ba8")} vs ${swatchFor("#5db3ff")}`
);

check("three-digit hex works", swatchFor("#abc") === swatchFor("#aabbcc"));
check("upper case works", swatchFor("#FF0000") === swatchFor("#ff0000"));
check("missing hash works", swatchFor("7c5cff") === swatchFor("#7c5cff"));
check("garbage has no square", swatchFor("not-a-colour") === null);
check("null has no square", swatchFor(null) === null);

section("formatPalette renders swatches above the hex codes");

const rainbow = formatPalette([
    "#ff5964",
    "#ff9e6d",
    "#ffd97d",
    "#7ee081",
    "#5db3ff",
    "#a86bff",
]);

check("returns a swatch line then a hex line", rainbow.split("\n").length === 2);
check(
    "swatch line has one square per colour",
    [...rainbow.split("\n")[0]].length === 6,
    rainbow.split("\n")[0]
);
check(
    "hex line repeats every colour",
    rainbow.split("\n")[1] ===
        "#ff5964 #ff9e6d #ffd97d #7ee081 #5db3ff #a86bff",
    rainbow.split("\n")[1]
);
check(
    "a varied palette is not one repeated square",
    new Set([...rainbow.split("\n")[0]]).size > 3,
    rainbow.split("\n")[0]
);

const dark = formatPalette(["#0a0a0a", "#1f1f1f", "#7c5cff", "#ffffff"]);

check(
    "dark palettes use the dark squares",
    dark.startsWith("\u2B1B\u2B1B"),
    dark.split("\n")[0]
);
check(
    "white in a palette uses the white square",
    dark.split("\n")[0].endsWith("\u2B1C"),
    dark.split("\n")[0]
);

check("empty input returns null", formatPalette([]) === null);
check("non-array input returns null", formatPalette(null) === null);
check(
    "blank entries are dropped",
    formatPalette(["", "  "]) === null,
    String(formatPalette(["", "  "]))
);

check(
    "max trims both lines",
    formatPalette(["#ff0000", "#00ff00", "#0000ff"], { max: 2 }) ===
        "\u{1F7E5}\u{1F7E9}\n#ff0000 #00ff00",
    formatPalette(["#ff0000", "#00ff00", "#0000ff"], { max: 2 })
);

check(
    "showHex false is swatches only",
    formatPalette(["#7c5cff"], { showHex: false }) === "\u{1F7EA}",
    formatPalette(["#7c5cff"], { showHex: false })
);

/*
 * /saved stacks several palettes in one embed, so it drops the swatch line and
 * keeps the hex codes. That is a one-line-per-entry saving, which is the whole
 * point, so the shape is asserted rather than trusted.
 */
check(
    "showSwatches false is hex codes alone",
    formatPalette(["#0a0a0a", "#7c5cff"], { showSwatches: false }) ===
        "#0a0a0a #7c5cff",
    JSON.stringify(
        formatPalette(["#0a0a0a", "#7c5cff"], { showSwatches: false })
    )
);
check(
    "showSwatches false stays on one line",
    formatPalette(
        ["#0a0a0a", "#1f1f1f", "#7c5cff", "#ffffff"],
        { showSwatches: false }
    ) === "#0a0a0a #1f1f1f #7c5cff #ffffff"
);
check(
    "showSwatches false still respects max",
    formatPalette(["#ff0000", "#00ff00", "#0000ff"], {
        max: 2,
        showSwatches: false,
    }) === "#ff0000 #00ff00"
);
check(
    "showSwatches false with showHex false has nothing left to say",
    formatPalette(["#7c5cff"], {
        showSwatches: false,
        showHex: false,
    }) === null
);
check(
    "showSwatches false still returns null for no colours",
    formatPalette([], { showSwatches: false }) === null
);

/*
 * A stored palette is free text, so a non-hex entry is printed but must not
 * borrow a stranger's square.
 */
const mixed = formatPalette(["not-a-colour", "#7c5cff"]);

check(
    "non-hex entries keep their text but get no square",
    mixed === "\u{1F7EA}\nnot-a-colour #7c5cff",
    JSON.stringify(mixed)
);

check(
    "all-non-hex input degrades to the hex line alone",
    formatPalette(["nonsense"]) === "nonsense",
    JSON.stringify(formatPalette(["nonsense"]))
);

section("STUDIO_URL only produces links people can actually open");

check(
    "a public domain is used",
    resolveStudioUrl("https://aesthetic.etterdigital.dev") ===
        "https://aesthetic.etterdigital.dev"
);
check(
    "a trailing slash is stripped",
    resolveStudioUrl("https://aesthetic.etterdigital.dev/") ===
        "https://aesthetic.etterdigital.dev"
);
check(
    "http on a real host is still allowed",
    resolveStudioUrl("http://studio.example.com") === "http://studio.example.com"
);

for (const bad of [
    "http://10.40.10.47:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.5:3000",
    "http://172.20.0.3:3000",
    "http://[::1]:3000",
    "http://0.0.0.0:3000",
]) {
    check(
        `${bad} is ignored`,
        resolveStudioUrl(bad) === "",
        JSON.stringify(resolveStudioUrl(bad))
    );
}

check(
    "a LAN address is ignored by default",
    resolveStudioUrl("http://10.40.10.47:3000") === "",
    JSON.stringify(resolveStudioUrl("http://10.40.10.47:3000"))
);

check(
    "a LAN address is honoured when explicitly allowed",
    resolveStudioUrl("http://10.40.10.47:3000", undefined, true) ===
        "http://10.40.10.47:3000",
    "STUDIO_URL_ALLOW_PRIVATE=true should keep the local link"
);

check(
    "the override does not accept garbage",
    resolveStudioUrl("not a url", undefined, true) === "",
    JSON.stringify(resolveStudioUrl("not a url", undefined, true))
);

check(
    "a garbage value is ignored rather than printed",
    resolveStudioUrl("not a url") === "",
    JSON.stringify(resolveStudioUrl("not a url"))
);
check(
    "a non-http scheme is ignored",
    resolveStudioUrl("discord://invite") === "",
    JSON.stringify(resolveStudioUrl("discord://invite"))
);
check(
    "unset input stays unset",
    resolveStudioUrl(undefined) === ""
);

check(
    "NEXT_PUBLIC_APP_URL is used when STUDIO_URL is unset",
    resolveStudioUrl(undefined, "https://studio.example.com") ===
        "https://studio.example.com"
);
check(
    "a public STUDIO_URL wins over NEXT_PUBLIC_APP_URL",
    resolveStudioUrl("https://aesthetic.etterdigital.dev", "https://studio.example.com") ===
        "https://aesthetic.etterdigital.dev"
);

/*
 * The whole point: a leftover dev-server value must not shadow a real
 * domain, and must not reach a user either.
 */
check(
    "a LAN STUDIO_URL falls through to a public NEXT_PUBLIC_APP_URL",
    resolveStudioUrl("http://10.40.10.47:3000", "https://aesthetic.etterdigital.dev") ===
        "https://aesthetic.etterdigital.dev"
);

check(
    "both unset yields no URL",
    resolveStudioUrl(undefined, undefined) === ""
);

section("Studio links degrade instead of breaking");

/*
 * `buildStudioLink` reads config at call time, so the base can be swapped to
 * exercise both branches without reloading the config module.
 */
function withStudioUrl(url, fn) {
    const original = config.studio.url;

    config.studio.url = url;

    try {
        return fn();
    } finally {
        config.studio.url = original;
    }
}

check(
    "a configured base produces a full link",
    withStudioUrl("https://aesthetic.etterdigital.dev", () =>
        buildStudioLink("/dashboard/premium")
    ) === "https://aesthetic.etterdigital.dev/dashboard/premium",
    String(buildStudioLink("/dashboard/premium"))
);

check(
    "an unset base produces no link",
    withStudioUrl("", () => buildStudioLink("/dashboard/premium")) === null
);

const linkedFooter = withStudioUrl("https://aesthetic.etterdigital.dev", () =>
    studioFooterLink("/dashboard/aesthetics", "your library")
);

check(
    "the footer links the page when a base is configured",
    linkedFooter ===
        "Open your library in Studio: https://aesthetic.etterdigital.dev/dashboard/aesthetics",
    linkedFooter
);

const bareFooter = withStudioUrl("", () =>
    studioFooterLink("/dashboard/aesthetics", "your library")
);

check(
    "the footer still names the page when unset",
    bareFooter ===
        "Manage this in Aesthetic King Studio (**/dashboard/aesthetics**).",
    bareFooter
);

for (const footer of [linkedFooter, bareFooter]) {
    check(
        "the footer never contains a machine address",
        !/10\.40\.10\.47|localhost|127\.0\.0\.1/.test(footer),
        footer
    );

    check(
        "the footer always names the page",
        footer.includes("/dashboard/aesthetics"),
        footer
    );
}

check(
    "the resolved base is not a machine address",
    !/10\.40\.10\.47|localhost|127\.0\.0\.1/.test(config.studio.url),
    JSON.stringify(config.studio.url)
);

console.log(
    `\n${passed} passed, ${failed} failed`
);

process.exit(failed > 0 ? 1 : 0);
