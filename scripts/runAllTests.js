#!/usr/bin/env node

/*
 * Runs every suite in scripts/ in one process-per-suite pass and prints a
 * summary.
 *
 * Each suite is a standalone script that exits non-zero when a check fails,
 * so the only job here is to run all of them rather than stopping at the
 * first failure. Stopping early made CI useless in practice: one broken
 * suite hid the state of the twenty that followed it.
 *
 * A suite that crashes (rather than reporting failures) still counts as a
 * failure — a stack trace is not a pass.
 *
 * Usage:
 *   node scripts/runAllTests.js              run everything
 *   node scripts/runAllTests.js Payments     only suites matching a substring
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SCRIPTS_DIR = __dirname;

const filter = process.argv[2] || "";

const suites = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((name) => /^test.*\.js$/.test(name))
    .filter((name) => name.toLowerCase().includes(filter.toLowerCase()))
    .sort();

if (suites.length === 0) {
    console.error(`No test suites matched "${filter}".`);
    process.exit(1);
}

const results = [];

for (const suite of suites) {
    const started = Date.now();

    const run = spawnSync(
        process.execPath,
        [path.join(SCRIPTS_DIR, suite)],
        { encoding: "utf8", cwd: path.join(SCRIPTS_DIR, "..") }
    );

    const output = `${run.stdout || ""}${run.stderr || ""}`;
    const lines = output.split(/\r?\n/).filter((line) => line.trim() !== "");

    results.push({
        suite,
        code: run.status,
        crashed: run.error != null,
        durationMs: Date.now() - started,
        summary: lines.length > 0 ? lines[lines.length - 1] : "(no output)",
        output,
    });
}

const green = (text) => `\u001b[32m${text}\u001b[0m`;
const red = (text) => `\u001b[31m${text}\u001b[0m`;
const dim = (text) => `\u001b[90m${text}\u001b[0m`;

console.log("");

for (const result of results) {
    const passed = result.code === 0 && !result.crashed;

    console.log(
        `${passed ? green("PASS") : red("FAIL")}  ` +
        `${result.suite.padEnd(32)} ` +
        `${dim(`${String(result.durationMs).padStart(5)}ms`)}  ` +
        result.summary.slice(0, 100)
    );
}

const failed = results.filter(
    (result) => result.code !== 0 || result.crashed
);

console.log("");
console.log(
    `${results.length - failed.length}/${results.length} suites passed.`
);

if (failed.length > 0) {
    console.log("");

    for (const result of failed) {
        console.log(red(`--- ${result.suite} exited ${result.code} ---`));

        /*
         * Suites print their own failure lines near the end, so the tail is
         * the useful part; the head usually only repeats setup noise.
         */
        const lines = result.output
            .split(/\r?\n/)
            .filter((line) => line.trim() !== "");

        for (const line of lines.slice(-25)) {
            console.log(line);
        }

        console.log("");
    }

    process.exit(1);
}
