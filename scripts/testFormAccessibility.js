"use strict";

/*
 * Guards the Studio forms: every visible input, textarea and select must carry
 * an accessible name. Screen readers announce a control from its <label>,
 * aria-label/aria-labelledby, or (as a weak fallback) a placeholder, so a
 * control with none of those is unusable without sight.
 *
 * This is a source scan rather than a render test: the components need a
 * database session to mount, but the rule is purely lexical.
 */

const fs = require("node:fs");
const path = require("node:path");

const STUDIO_ROOT = path.join(__dirname, "..", "studio");

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

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) {
            continue;
        }

        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walk(full, out);
        } else if (entry.name.endsWith(".tsx")) {
            out.push(full);
        }
    }

    return out;
}

/*
 * Finds the end of a JSX opening tag. Counts braces so that `=>` inside an
 * inline arrow function does not end the tag early, and skips over quoted
 * strings so a ">" in a className or label text is ignored.
 */
function openingTagEnd(source, start) {
    let depth = 0;
    let quote = null;

    for (let i = start; i < source.length; i += 1) {
        const ch = source[i];

        if (quote) {
            if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === "'" || ch === "`") {
            quote = ch;
        } else if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
        } else if (ch === ">" && depth === 0) {
            return i + 1;
        }
    }

    return Math.min(source.length, start + 4000);
}

function collectControls() {
    const unlabelled = [];
    let visible = 0;

    for (const file of walk(STUDIO_ROOT)) {
        const source = fs.readFileSync(file, "utf8");
        const rel = path.relative(STUDIO_ROOT, file);
        const control = /<(input|textarea|select)\b/g;
        let match;

        while ((match = control.exec(source)) !== null) {
            const tag = source.slice(
                match.index,
                openingTagEnd(source, match.index)
            );
            const line = source.slice(0, match.index).split("\n").length;

            if (/type\s*=\s*"hidden"/.test(tag)) {
                continue;
            }

            visible += 1;

            const idMatch = /\bid\s*=\s*"([^"]+)"/.exec(tag);
            const hasOwnLabel =
                /aria-label\s*[={]/.test(tag) ||
                /aria-labelledby\s*[={]/.test(tag) ||
                /placeholder\s*[={]/.test(tag) ||
                (idMatch &&
                    source.includes(`htmlFor="${idMatch[1]}"`)) ||
                source.lastIndexOf("<label") >
                    source.lastIndexOf("</label>", match.index);

            if (!hasOwnLabel) {
                unlabelled.push(`${rel}:${line} <${match[1]}>`);
            }
        }
    }

    return { unlabelled, visible };
}

console.log("\nform controls carry an accessible name");

const { unlabelled, visible } = collectControls();

check(
    "the scan found the controls we expect to police",
    visible >= 50,
    `only ${visible} visible controls were found, so the scan is probably broken`
);

check(
    "no visible input, textarea or select is missing a label",
    unlabelled.length === 0,
    `${unlabelled.length} unlabelled:\n      ${unlabelled.join("\n      ")}`
);

console.log(`\n${passed} passed, ${failed} failed\n`);

process.exit(failed > 0 ? 1 : 0);
