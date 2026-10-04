#!/usr/bin/env node
/**
 * Phase 5 verification for "Complete My Profile".
 *
 * `studio/lib/profileComposer.ts` is the deterministic half of the feature:
 * given one seed (a set, an aesthetic, a colour, or a saved palette) it
 * returns a finished profile draft. It is pure, so unlike the rest of the
 * Studio it can be tested exhaustively without a database or a Workers
 * runtime — this script transpiles the real module with the Studio's own
 * esbuild and asserts against shipped code rather than a copy.
 *
 * The interesting risk is not "does it produce text" but "can it produce
 * something the Builder cannot render". The asset catalog and the Studio's
 * own dropdowns disagree: the catalog carries aesthetics (`horror`,
 * `minimalist`) and moods (`night`) the Studio does not offer, `y2k` has no
 * symbol block at all, and set colour tags are words rather than hex. Those
 * mismatches are what sections 3-6 hammer.
 *
 * Asserted behaviour:
 *
 *   1. Every seed kind yields a draft that passes checkCompleteness.
 *   2. A fixed seed plus fixed randomness is byte-identical (determinism).
 *   3. Nothing outside the Studio's aesthetic/mood lists can escape.
 *   4. Palette, accent and symbols are valid and inside PROFILE_LIMITS.
 *   5. A set the user may not have is never handed back (premium filtering
 *      is the caller's, so the composer is checked to obey its input list).
 *   6. excludeSetId rerolls never repeat the previous set.
 *   7. Text the user already wrote is never overwritten.
 *   8. Bad input fails as ExpectedError, not as a crash or a silent guess.
 *
 * Usage: node scripts/testCompleteProfile.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const esbuild = require(path.join(
    ROOT,
    "studio",
    "node_modules",
    "esbuild"
));

const COMPOSER_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "profileComposer.ts"
);

const MODEL_PATH = path.join(
    ROOT,
    "studio",
    "lib",
    "profileModel.ts"
);

const CATALOG_PATH = path.join(
    ROOT,
    "src",
    "data",
    "assetCatalog.json"
);

let passed = 0;
let failed = 0;

function check(label, condition, extra = "") {
    if (condition) {
        passed += 1;
        console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    } else {
        failed += 1;
        console.log(
            `  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`
        );
    }
}

function section(title) {
    console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function eq(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Compiles a Studio module to CommonJS and evaluates it.
 *
 * `profileComposer.ts` imports two JSON catalogs and, through `apiError`,
 * `next/server`. The JSON is loaded from disk; `next/server` is stubbed,
 * because the composer only needs `ExpectedError` and pulling Next into a
 * plain Node process is both slow and irrelevant to what is being tested.
 */
function loadModule(modulePath, stubRequire = {}) {
    const result = esbuild.transformSync(
        fs.readFileSync(modulePath, "utf8"),
        {
            loader: "ts",
            format: "cjs",
            target: "node20",
        }
    );

    const module = { exports: {} };

    const req = (specifier) => {
        if (
            Object.prototype.hasOwnProperty.call(
                stubRequire,
                specifier
            )
        ) {
            return stubRequire[specifier];
        }

        if (specifier.startsWith(".")) {
            const base = path.resolve(
                path.dirname(modulePath),
                specifier
            );

            for (const candidate of [
                base,
                `${base}.json`,
                `${base}.ts`,
                path.join(base, "index.ts"),
            ]) {
                if (
                    fs.existsSync(candidate) &&
                    fs.statSync(candidate).isFile()
                ) {
                    return candidate.endsWith(".json")
                        ? JSON.parse(
                            fs.readFileSync(candidate, "utf8")
                        )
                        : loadModule(candidate, stubRequire);
                }
            }
        }

        return require(specifier);
    };

    // eslint-disable-next-line no-new-func
    new Function("module", "exports", "require", result.code)(
        module,
        module.exports,
        req
    );

    return module.exports;
}

const stubs = {
    "next/server": {
        NextResponse: {},
    },
};

const composer = loadModule(COMPOSER_PATH, stubs);
const model = loadModule(MODEL_PATH, stubs);

const { composeProfileDraft, catalogColorToHex } = composer;
const {
    PROFILE_LIMITS,
    MIN_PALETTE_COLORS,
    checkCompleteness,
    normalizeHex,
    normalizePalette,
} = model;

const {
    AESTHETICS,
    isValidAestheticId,
} = loadModule(
    path.join(ROOT, "studio", "lib", "aesthetics.ts"),
    stubs
);
const { MOODS, isValidMoodId } = loadModule(
    path.join(ROOT, "studio", "lib", "moods.ts"),
    stubs
);

const allSets = JSON.parse(
    fs.readFileSync(CATALOG_PATH, "utf8")
).filter((set) => set.enabled !== false);

const freeSets = allSets.filter((set) => set.premium !== true);

/**
 * A deterministic pseudo-random source so a failure reproduces exactly.
 */
function seeded(seedValue) {
    let state = seedValue >>> 0;

    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function codePoints(value) {
    return [...String(value ?? "")].length;
}

/* ------------------------------------------------------------------ */

section("1. Every seed kind produces a complete profile");

const aestheticSeeds = AESTHETICS.map((a) => a.id);
const colorSeeds = composer.COMPLETABLE_COLOR_NAMES;

const kindCases = [
    {
        label: "profileSet seed",
        seed: { kind: "profileSet", id: freeSets[0].id },
    },
    {
        label: "aesthetic seed (gothic)",
        seed: { kind: "aesthetic", id: "gothic" },
    },
    {
        label: "color seed (indigo)",
        seed: { kind: "color", name: "indigo" },
    },
    {
        label: "palette seed",
        seed: {
            kind: "palette",
            colors: ["#112233", "#445566", "#778899"],
        },
    },
];

for (const testCase of kindCases) {
    const result = composeProfileDraft({
        seed: testCase.seed,
        sets: freeSets,
        random: seeded(1234),
    });

    const completeness = checkCompleteness(result.draft);

    check(
        `${testCase.label} is complete`,
        completeness.complete,
        `missing ${JSON.stringify(completeness.missing)}`
    );

    check(
        `${testCase.label} chose a set`,
        typeof result.draft.profileSetId === "string"
    );
}

section("2. Every Studio aesthetic and catalog colour composes");

let aestheticOk = true;
const aestheticFailures = [];
const bioFailures = [];

for (const id of aestheticSeeds) {
    try {
        const result = composeProfileDraft({
            seed: { kind: "aesthetic", id },
            sets: allSets,
            random: seeded(7),
        });

        const completeness = checkCompleteness(result.draft);

        if (!completeness.complete) {
            aestheticOk = false;
            aestheticFailures.push(`${id}: ${completeness.missing}`);
        }

        /*
         * The bio describes the aesthetic the user picked. When the label
         * came from the mood instead, a Gothic set tagged "calm" produced
         * "Calm energy — dark, dramatic, mysterious", which contradicts
         * itself; the name in the sentence is the cheapest thing to assert.
         */
        const aestheticName =
            AESTHETICS.find(
                (option) => option.id === result.aestheticId
            )?.name ?? result.aestheticId;

        if (!result.draft.bio.includes(aestheticName)) {
            bioFailures.push(`${id}: ${result.draft.bio}`);
        }
    } catch (error) {
        aestheticOk = false;
        aestheticFailures.push(`${id}: ${error.message}`);
    }
}

check(
    `all ${aestheticSeeds.length} Studio aesthetics compose completely`,
    aestheticOk,
    aestheticFailures.join(" | ")
);

check(
    "every bio describes the aesthetic rather than the mood",
    bioFailures.length === 0,
    bioFailures.join(" | ")
);

let colorOk = true;
const colorFailures = [];

for (const name of colorSeeds) {
    try {
        const result = composeProfileDraft({
            seed: { kind: "color", name },
            sets: allSets,
            random: seeded(11),
        });

        const completeness = checkCompleteness(result.draft);

        if (!completeness.complete) {
            colorOk = false;
            colorFailures.push(`${name}: ${completeness.missing}`);
        }
    } catch (error) {
        colorOk = false;
        colorFailures.push(`${name}: ${error.message}`);
    }
}

check(
    `all ${colorSeeds.length} catalog colours compose completely`,
    colorOk,
    colorFailures.join(" | ")
);

section("3. Determinism");

const first = composeProfileDraft({
    seed: { kind: "aesthetic", id: "gothic" },
    sets: freeSets,
    random: seeded(99),
});

const second = composeProfileDraft({
    seed: { kind: "aesthetic", id: "gothic" },
    sets: freeSets,
    random: seeded(99),
});

check(
    "same seed and random source produce the same draft",
    eq(first.draft, second.draft)
);

const third = composeProfileDraft({
    seed: { kind: "aesthetic", id: "gothic" },
    sets: freeSets,
    random: seeded(100),
});

check(
    "a different random source produces a different draft",
    !eq(first.draft, third.draft)
);

section("4. Nothing unrenderable escapes into a draft");

/*
 * The catalog's id sets are wider than the Studio's, so this is the real
 * regression guard: iterate every set as a profileSet seed and assert the
 * reported aesthetic/mood are ids the Builder can display.
 */
let escapedAesthetic = null;
let escapedMood = null;
let missingSet = 0;

for (const set of allSets) {
    const result = composeProfileDraft({
        seed: { kind: "profileSet", id: set.id },
        sets: allSets,
        random: seeded(Number(set.id) || 1),
    });

    if (!isValidAestheticId(result.aestheticId)) {
        escapedAesthetic = `${set.id} -> ${result.aestheticId}`;
    }

    if (
        result.moodId !== null &&
        !MOODS.some((m) => m.id === result.moodId)
    ) {
        escapedMood = `${set.id} -> ${result.moodId}`;
    }

    if (!allSets.some((s) => s.id === result.draft.profileSetId)) {
        missingSet += 1;
    }
}

check(
    `every catalog set maps to a Studio aesthetic (${allSets.length} sets)`,
    escapedAesthetic === null,
    escapedAesthetic ?? ""
);

check(
    "no mood outside MOODS reaches a draft",
    escapedMood === null,
    escapedMood ?? ""
);

check(
    "profileSetId always names a real catalog set",
    missingSet === 0,
    `${missingSet} bad ids`
);

check(
    "horror maps to a Studio aesthetic rather than leaking",
    composeProfileDraft({
        seed: { kind: "aesthetic", id: "horror" },
        sets: allSets,
        random: seeded(3),
    }).aestheticId === "gothic"
);

section("5. Palette, symbols and limits");

const composed = composeProfileDraft({
    seed: { kind: "aesthetic", id: "kawaii" },
    sets: freeSets,
    random: seeded(555),
}).draft;

check(
    "palette has at least MIN_PALETTE_COLORS colours",
    composed.palette.length >= MIN_PALETTE_COLORS
);

check(
    "every palette entry is normalised hex",
    composed.palette.every(
        (hex) => normalizeHex(hex) === hex
    )
);

check(
    "palette is inside the limit",
    composed.palette.length <= PROFILE_LIMITS.palette
);

check(
    "accent colour is a palette colour",
    composed.palette.includes(composed.accentColor)
);

check(
    "symbols are present and capped",
    composed.symbols.length > 0 &&
    composed.symbols.length <= PROFILE_LIMITS.symbols
);

check(
    "username is within Discord's limit",
    codePoints(composed.username) <=
    PROFILE_LIMITS.username
);

check(
    "bio is within Discord's About Me limit",
    codePoints(composed.bio) <= PROFILE_LIMITS.bio
);

check(
    "status is within Discord's status limit",
    codePoints(composed.status) <= PROFILE_LIMITS.status
);

check(
    "username is lowercase alphanumeric",
    /^[a-z0-9]+$/.test(composed.username),
    composed.username
);

const paletteSeedResult = composeProfileDraft({
    seed: {
        kind: "palette",
        colors: ["#FF0044", "#222222"],
    },
    sets: freeSets,
    random: seeded(21),
});

check(
    "a palette seed keeps the user's colours first",
    eq(
        paletteSeedResult.draft.palette.slice(0, 2),
        ["#FF0044", "#222222"]
    ),
    JSON.stringify(paletteSeedResult.draft.palette)
);

check(
    "catalogColorToHex knows the catalog's names",
    normalizeHex(catalogColorToHex("indigo")) !== null &&
    catalogColorToHex("chartreuse") === null &&
    catalogColorToHex(null) === null
);

section("6. Premium filtering and rerolls");

/*
 * Premium filtering lives with the caller (it needs the entitlement), so
 * what is asserted here is that the composer never invents a set outside
 * the list it was handed — which is the property the caller relies on.
 */
const fromFreeOnly = allSets
    .filter((set) => set.premium === true)
    .slice(0, 5)
    .map((premiumSet) =>
        composeProfileDraft({
            seed: { kind: "aesthetic", id: "gothic" },
            sets: freeSets,
            random: seeded(42),
        }).draft.profileSetId
    );

check(
    "a premium set id is never returned when only free sets were given",
    fromFreeOnly.every(
        (id) =>
            !allSets.some(
                (set) => set.id === id && set.premium === true
            )
    )
);

check(
    "a premium set can be seeded when it is in the list",
    (() => {
        const premiumSet = allSets.find(
            (set) => set.premium === true
        );

        if (!premiumSet) {
            return true;
        }

        const result = composeProfileDraft({
            seed: {
                kind: "profileSet",
                id: premiumSet.id,
            },
            sets: allSets,
            random: seeded(8),
        });

        return result.draft.profileSetId === premiumSet.id;
    })()
);

const rerollSets = new Set();

for (let i = 0; i < 12; i += 1) {
    const previous =
        i === 0
            ? null
            : [...rerollSets][
                [...rerollSets].length - 1
            ];

    const result = composeProfileDraft({
        seed: { kind: "aesthetic", id: "cyber" },
        sets: freeSets,
        excludeSetId: previous,
        random: seeded(1000 + i),
    });

    if (i > 0) {
        check(
            `reroll ${i} avoids the previous set`,
            result.draft.profileSetId !== previous
        );
    }

    rerollSets.add(result.draft.profileSetId);
}

check(
    "rerolls explore more than one set",
    rerollSets.size > 1,
    `saw ${rerollSets.size}`
);

section("7. The user's own words survive");

const partial = composeProfileDraft({
    seed: { kind: "aesthetic", id: "romantic" },
    sets: freeSets,
    existing: {
        username: "myname",
        bio: "written by a human, not a bot",
        palette: ["#123456", "#654321"],
        symbols: ["♡"],
        accentColor: "#ABCDEF",
    },
    random: seeded(77),
});

check(
    "an existing username is kept",
    partial.draft.username === "myname"
);

check(
    "an existing bio is kept",
    partial.draft.bio === "written by a human, not a bot"
);

check(
    "an existing palette is kept",
    eq(partial.draft.palette, ["#123456", "#654321"])
);

check(
    "existing symbols are kept",
    eq(partial.draft.symbols, ["♡"])
);

check(
    "an existing accent colour is kept",
    partial.draft.accentColor === "#ABCDEF"
);

check(
    "a missing status is still filled in",
    typeof partial.draft.status === "string" &&
    partial.draft.status.length > 0
);

check(
    "filled reports only what changed",
    !partial.filled.includes("bio") &&
    !partial.filled.includes("username") &&
    partial.filled.includes("status"),
    JSON.stringify(partial.filled)
);

check(
    "a half-written profile ends up complete",
    checkCompleteness(partial.draft).complete
);

check(
    "the caller's draft object is not mutated",
    (() => {
        const source = {
            username: "keepme",
            bio: null,
            status: null,
            palette: ["#111111", "#222222"],
            symbols: [],
        };

        composeProfileDraft({
            seed: { kind: "aesthetic", id: "nature" },
            sets: freeSets,
            existing: source,
            random: seeded(5),
        });

        return (
            source.bio === null &&
            source.palette.length === 2 &&
            source.symbols.length === 0
        );
    })()
);

section("8. Bad input fails as ExpectedError");

function expectError(label, fn, fragment = "") {
    try {
        fn();
        check(label, false, "no error thrown");
    } catch (error) {
        const named = error?.name === "ExpectedError";
        const worded =
            !fragment ||
            String(error.message).includes(fragment);

        check(
            label,
            named && worded,
            `${error?.name}: ${error?.message}`
        );
    }
}

expectError(
    "an unknown profile set is refused",
    () =>
        composeProfileDraft({
            seed: { kind: "profileSet", id: "999999" },
            sets: freeSets,
            random: seeded(1),
        }),
    "not available"
);

expectError(
    "an unknown colour name is refused",
    () =>
        composeProfileDraft({
            seed: { kind: "color", name: "blurple" },
            sets: freeSets,
            random: seeded(1),
        }),
    "colour"
);

expectError(
    "an empty palette seed is refused",
    () =>
        composeProfileDraft({
            seed: { kind: "palette", colors: [] },
            sets: freeSets,
            random: seeded(1),
        }),
    "colour"
);

expectError(
    "an all-junk palette seed is refused",
    () =>
        composeProfileDraft({
            seed: { kind: "palette", colors: ["nope", "#12"] },
            sets: freeSets,
            random: seeded(1),
        })
);

expectError(
    "an empty set list is refused",
    () =>
        composeProfileDraft({
            seed: { kind: "aesthetic", id: "gothic" },
            sets: [],
            random: seeded(1),
        }),
    "no profile sets"
);

/*
 * An unknown aesthetic id is deliberately *not* an error: the catalog and
 * the Studio disagree about the id set, so an unfamiliar tag has to degrade
 * to something renderable rather than break the button.
 */
const unknownAesthetic = composeProfileDraft({
    seed: { kind: "aesthetic", id: "goblincore" },
    sets: freeSets,
    random: seeded(6),
});

check(
    "an unknown aesthetic degrades to a Studio aesthetic",
    isValidAestheticId(unknownAesthetic.aestheticId) &&
    checkCompleteness(unknownAesthetic.draft).complete
);

check(
    "aesthetic ids are matched case-insensitively",
    composeProfileDraft({
        seed: { kind: "aesthetic", id: "  Gothic  " },
        sets: freeSets,
        random: seeded(6),
    }).aestheticId === "gothic"
);

/* ------------------------------------------------------------------ */
/* 9. The wire format the Builder actually sends                        */
/* ------------------------------------------------------------------ */

section("9. parseCompletionSeed accepts what the UI sends");

/*
 * These assertions are about the HTTP contract rather than the maths. The
 * composer takes typed objects, so a mismatch between the JSON the panel
 * posts and the strings the parser compares would only ever appear in a
 * browser: every "Profile set" click would 400 while all of the composer
 * tests above stayed green.
 */
const completion = loadModule(
    path.join(ROOT, "studio", "lib", "profileCompletion.ts"),
    {
        ...stubs,
        "cloudflare:workers": { env: {} },
    }
);

const { parseCompletionSeed, parseExistingDraft } = completion;

const seedCases = [
    {
        label: "a profile set seed",
        body: { kind: "profileSet", id: "10" },
        expect: { kind: "profileSet", id: "10" },
    },
    {
        label: "an aesthetic seed",
        body: { kind: "aesthetic", id: "gothic" },
        expect: { kind: "aesthetic", id: "gothic" },
    },
    {
        label: "a colour seed",
        body: { kind: "color", name: "indigo" },
        expect: { kind: "color", name: "indigo" },
    },
    {
        label: "a palette seed",
        body: { kind: "palette", colors: ["#123456", "#abcdef"] },
        expect: { kind: "palette", colors: ["#123456", "#ABCDEF"] },
    },
];

for (const testCase of seedCases) {
    let parsed = null;
    let message = "";

    try {
        parsed = parseCompletionSeed(testCase.body);
    } catch (error) {
        message = error.message;
    }

    check(
        `${testCase.label} parses`,
        parsed !== null &&
        eq(parsed, testCase.expect),
        message || JSON.stringify(parsed)
    );
}

check(
    "a seed kind is matched case-insensitively",
    (() => {
        try {
            return (
                parseCompletionSeed({
                    kind: "PROFILESET",
                    id: "4",
                }).id === "4"
            );
        } catch {
            return false;
        }
    })()
);

const rejectedSeeds = [
    ["nothing at all", undefined],
    ["a seed with no kind", {}],
    ["an unknown kind", { kind: "vibe" }],
    ["a set with a non-numeric id", { kind: "profileSet", id: "abc" }],
    ["a set with a shaped id", { kind: "profileSet", id: "1; DROP" }],
    ["an unknown aesthetic", { kind: "aesthetic", id: "goblincore" }],
    ["an unknown colour", { kind: "color", name: "chartreuse" }],
    ["an empty palette", { kind: "palette", colors: [] }],
    ["a palette of junk", { kind: "palette", colors: ["nope", ""] }],
];

for (const [label, body] of rejectedSeeds) {
    let status = "accepted";

    try {
        parseCompletionSeed(body);
    } catch (error) {
        status =
            error instanceof Error &&
            error.name === "ExpectedError"
                ? "refused"
                : `threw ${error.name}`;
    }

    check(
        `${label} is refused as an ExpectedError`,
        status === "refused",
        status
    );
}

check(
    "a draft with nothing in it parses to null",
    parseExistingDraft(undefined) === null &&
    parseExistingDraft("nonsense") === null
);

check(
    "what the user typed survives the parse",
    (() => {
        const parsed = parseExistingDraft({
            name: "  My profile  ",
            bio: "written by a human",
            palette: ["#123456", "bogus"],
            symbols: ["♡"],
        });

        return (
            parsed?.name === "My profile" &&
            parsed?.bio === "written by a human" &&
            eq(parsed?.palette, ["#123456"]) &&
            eq(parsed?.symbols, ["♡"])
        );
    })()
);

/* ------------------------------------------------------------------ */
/* 10. The AI pass: what it is asked for, and what it may keep          */
/* ------------------------------------------------------------------ */

section("10. The AI prompt and the username guard");

/*
 * The prompt is the only place the seed's aesthetic reaches the model, and
 * the username guard is the only thing between the model and Discord's
 * username box. Both were wrong in ways that only showed up against a live
 * model: the prompt described a different aesthetic than the user picked,
 * and the guard threw away legal names such as "cupcake_puff".
 *
 * Ollama is stubbed here, so these run offline and deterministically while
 * still going through the real `completeProfile`.
 */
let lastPrompt = "";
let lastOptions = null;
let cannedReply = "";

const aiCompletion = loadModule(
    path.join(ROOT, "studio", "lib", "profileCompletion.ts"),
    {
        ...stubs,
        "cloudflare:workers": { env: {} },
        "./ollama": {
            async generateOllamaText(prompt, options) {
                lastPrompt = prompt;
                lastOptions = options ?? null;
                return cannedReply;
            },
        },
    }
);

function runAi(seed, reply, existing) {
    lastPrompt = "";
    lastOptions = null;
    cannedReply = reply;

    return aiCompletion.completeProfile({
        seed,
        sets: freeSets,
        existing: existing ?? null,
        useAi: true,
    });
}

/* The module is evaluated as CommonJS, so this section needs its own async scope. */
(async () => {

const kawaiiReply = JSON.stringify({
    username: "cupcake_puff",
    bio: "sprinkles on everything I touch.",
    status: "in a soft mood",
});

const kawaii = await runAi({ kind: "aesthetic", id: "kawaii" }, kawaiiReply);

check(
    "the AI copy is reported as used",
    kawaii.ai === true,
    JSON.stringify(kawaii.draft)
);

check(
    "an underscore username is kept, not thrown away",
    kawaii.draft.username === "cupcake_puff",
    kawaii.draft.username
);

check(
    "the bio and status come from the model",
    kawaii.draft.bio === "sprinkles on everything I touch." &&
        kawaii.draft.status === "in a soft mood"
);

check(
    "the prompt asks for JSON-constrained output",
    lastOptions?.json === true,
    JSON.stringify(lastOptions)
);

check(
    "the prompt names the aesthetic with the catalog description",
    lastPrompt.includes("Kawaii") &&
        /AESTHETIC: Kawaii — .+/.test(lastPrompt),
    lastPrompt.slice(0, 200)
);

check(
    "the prompt does not quote the chosen set's own aesthetic tags",
    !/^Aesthetics:/m.test(lastPrompt) && !/^Moods:/m.test(lastPrompt),
    lastPrompt
);

check(
    "the prompt offers a palette line",
    /^PALETTE: .+/m.test(lastPrompt),
    (lastPrompt.match(/^PALETTE: .+/m) || [""])[0]
);

check(
    "the prompt tells the model underscores are legal",
    /underscores/i.test(lastPrompt)
);

/*
 * Every aesthetic must be described, otherwise the model is back to
 * guessing, and the guard must still reject the shapes that are not
 * usernames at all.
 */
let undescribed = [];

for (const aesthetic of AESTHETICS) {
    const composed = await runAi(
        { kind: "aesthetic", id: aesthetic.id },
        kawaiiReply
    );

    if (!new RegExp(`AESTHETIC: .+ — .+`).test(lastPrompt)) {
        undescribed.push(aesthetic.id);
    }

    if (!composed.ai) {
        undescribed.push(`${aesthetic.id} (no copy)`);
    }
}

check(
    "every aesthetic reaches the prompt with a description",
    undescribed.length === 0,
    undescribed.join(", ")
);

const usernameCases = [
    ["cupcake_puff", true],
    ["neonflux_99", true],
    ["starrypaw_umi", true],
    ["gothicrose", true],
    ["_leading", false],
    ["trailing_", false],
    ["double__underscore", false],
    ["Dots.Not.Allowed", false],
    ["@handle", false],
    ["has spaces", false],
    ["a", false],
    ["x".repeat(33), false],
];

for (const [username, expected] of usernameCases) {
    const result = await runAi(
        { kind: "aesthetic", id: "gothic" },
        JSON.stringify({ username, bio: "kept either way." })
    );

    const kept = result.draft.username === username;

    check(
        `"${username}" is ${expected ? "kept" : "rejected"}`,
        kept === expected,
        result.draft.username
    );
}

/* A reply that is not JSON must degrade, not fail. */
const degraded = await runAi(
    { kind: "aesthetic", id: "gothic" },
    "Sure! Here you go: a bio about darkness."
);

check(
    "a non-JSON reply falls back to catalog copy",
    degraded.ai === false &&
        typeof degraded.draft.bio === "string" &&
        degraded.draft.bio.length > 0,
    JSON.stringify(degraded.draft)
);

const emptyish = await runAi(
    { kind: "aesthetic", id: "gothic" },
    JSON.stringify({ username: "@@@", bio: "", status: "" })
);

check(
    "a JSON reply with nothing usable falls back too",
    emptyish.ai === false,
    JSON.stringify(emptyish.draft)
);

const partial = await runAi(
    { kind: "aesthetic", id: "gothic" },
    JSON.stringify({ bio: "only a bio this time." })
);

check(
    "a partial reply keeps the catalog's other fields",
    partial.ai === true &&
        partial.draft.bio === "only a bio this time." &&
        typeof partial.draft.username === "string" &&
        partial.draft.username.length > 0
);

const untouched = await runAi(
    { kind: "aesthetic", id: "gothic" },
    kawaiiReply,
    { bio: "typed by a human" }
);

check(
    "the model may not overwrite what the user wrote",
    untouched.draft.bio === "typed by a human"
);

console.log(
    `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m\n`
);

process.exit(failed > 0 ? 1 : 0);

})();
