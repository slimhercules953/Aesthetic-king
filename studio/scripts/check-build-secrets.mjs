#!/usr/bin/env node
/**
 * Post-build guard: fails the build if any secret value leaks into build output.
 *
 * Context: `@cloudflare/vite-plugin` writes `dist/server/.dev.vars` on every
 * build. That is intentional and required — `npm run start` runs
 * `wrangler dev --config dist/server/wrangler.json`, and wrangler resolves
 * `.dev.vars` relative to the *config directory*, so deleting the file leaves
 * the preview Worker with no DATABASE_URL / SESSION_SECRET at all. `dist/` is
 * gitignored and `.dev.vars` is listed in `dist/client/.assetsignore`, so the
 * file reaches neither git nor Cloudflare.
 *
 * The dangerous case is different: a secret inlined into compiled JavaScript,
 * which *is* uploaded. That happens when server-only config is reachable from a
 * client component, or when someone prefixes a real secret with `NEXT_PUBLIC_`.
 * This script scans every emitted text asset for the literal values of the
 * local secrets and fails loudly if one is found.
 *
 * Only key names are ever printed — never the values.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, posix } from "node:path";
import { fileURLToPath } from "node:url";

const studioRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = join(studioRoot, "dist");

/** Keys whose values are public by design, so finding them is not a leak. */
const PUBLIC_KEY_PATTERN = /^NEXT_PUBLIC_/;

/** Values shorter than this are too generic to search for reliably. */
const MIN_SECRET_LENGTH = 8;

/** Extensions worth reading as text. Binary assets cannot leak a string usefully. */
const TEXT_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".css", ".json", ".html", ".txt", ".map", ".svg",
]);

function parseDotEnv(raw) {
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === "'" || quote === '"' || quote === "`") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    if (key) entries.push({ key, value });
  }
  return entries;
}

/**
 * Reads secret values from the developer's `.env.local` and from the generated
 * `dist/server/.dev.vars`. Either file alone is enough; reading both means the
 * guard still works if one is missing.
 */
function collectSecrets() {
  const sources = [
    { label: ".env.local", path: join(studioRoot, ".env.local") },
    { label: "dist/server/.dev.vars", path: join(distDir, "server", ".dev.vars") },
  ];

  const byValue = new Map();
  for (const { label, path } of sources) {
    if (!existsSync(path)) continue;
    for (const { key, value } of parseDotEnv(readFileSync(path, "utf8"))) {
      if (PUBLIC_KEY_PATTERN.test(key)) continue;
      if (!value || value.length < MIN_SECRET_LENGTH) continue;
      if (!byValue.has(value)) byValue.set(value, { key, source: label });
    }
  }

  return [...byValue.entries()].map(([value, meta]) => ({ value, ...meta }));
}

function* walk(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      yield full;
    }
  }
}

/**
 * `dist/server/.dev.vars` is wrangler's local secret store, so by definition it
 * contains the values; `.assetsignore` merely names files.
 */
function isExpectedSecretStore(relPath) {
  return relPath === "server/.dev.vars" || relPath === "client/.assetsignore";
}

/**
 * Source directories that are never uploaded as-is. If a configured value also
 * appears verbatim in the source tree it is a shared literal, not a secret —
 * e.g. `OLLAMA_MODEL` happens to equal the fallback model name in `lib/ollama.ts`.
 */
const SOURCE_DIRS = ["app", "lib", "components", "scripts"];

function collectSourceLiterals() {
  const literals = new Set();
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(studioRoot, dir))) {
      const dot = file.lastIndexOf(".");
      if (dot === -1) continue;
      const ext = file.slice(dot).toLowerCase();
      if (![".ts", ".tsx", ".js", ".mjs", ".json"].includes(ext)) continue;
      let content;
      try {
        content = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const match of content.matchAll(/["'`]([^"'`\n]{8,})["'`]/g)) {
        literals.add(match[1]);
      }
    }
  }
  return literals;
}

function main() {
  if (!existsSync(distDir)) {
    console.error(`check-build-secrets: no dist/ directory found in ${studioRoot}`);
    process.exit(1);
  }

  const secrets = collectSecrets();
  if (secrets.length === 0) {
    console.log("check-build-secrets: no secret values available to scan for; skipping.");
    return;
  }

  const sourceLiterals = collectSourceLiterals();
  const hardcoded = secrets.filter((s) => sourceLiterals.has(s.value));
  const candidates = secrets.filter((s) => !sourceLiterals.has(s.value));

  for (const secret of hardcoded) {
    console.warn(
      `check-build-secrets: note — the value of ${secret.key} also appears verbatim in the ` +
        `source tree, so it is not confidential and is excluded from the build-output scan. ` +
        `If that is unexpected, remove the literal from source.`
    );
  }

  const leaks = [];
  let scanned = 0;

  for (const file of walk(distDir)) {
    const rel = relative(distDir, file).split(/[\\/]/).join("/");
    if (isExpectedSecretStore(rel)) continue;

    const dot = file.lastIndexOf(".");
    if (dot === -1 || !TEXT_EXTENSIONS.has(file.slice(dot).toLowerCase())) continue;

    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    scanned += 1;

    for (const secret of candidates) {
      if (content.includes(secret.value)) {
        leaks.push({ key: secret.key, source: secret.source, file: posix.join("dist", rel) });
      }
    }
  }

  if (leaks.length > 0) {
    console.error(
      `\ncheck-build-secrets: FAILED — ${leaks.length} secret value(s) inlined into build output.\n` +
        "Build output is uploaded to Cloudflare, so anything in it is public.\n"
    );
    for (const leak of leaks) {
      console.error(`  ${leak.key} (from ${leak.source}) found in ${leak.file}`);
    }
    console.error(
      "\nFix: keep the value server-only. Do not read it from a client component,\n" +
        "and never prefix a real secret with NEXT_PUBLIC_."
    );
    process.exit(1);
  }

  console.log(
    `check-build-secrets: OK — scanned ${scanned} build file(s) against ${candidates.length} secret(s); no leaks.`
  );
}

main();
