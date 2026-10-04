const js = require("@eslint/js");

/*
 * ESLint 9 reads this file and ignores `.eslintrc.json` entirely, so the
 * rules from that file are restated here rather than left dead.
 *
 * Scope is deliberate:
 *
 * - `src/` and `scripts/` are linted. That is the v2 bot and its tooling.
 * - `index.js`, `events/`, `handler/`, `slash/` and `images/` are the v1
 *   bot kept running for reference. Linting them would produce a wall of
 *   findings nobody intends to fix, which teaches everyone to ignore the
 *   linter — worse than not having one.
 * - `studio/` has its own gate: `tsc --noEmit` plus the accessibility and
 *   payments suites. It has no ESLint install, and adding one would be a
 *   second toolchain for no additional signal.
 */
module.exports = [
    {
        ignores: [
            "node_modules/**",
            "images/**",
            "assets/**",
            "studio/**",
            "index.js",
            "events/**",
            "handler/**",
            "slash/**",
            "prisma/migrations/**",
            /*
             * TypeScript, and there is no TS parser installed here. The
             * Prisma config is validated by `prisma validate` instead.
             */
            "prisma.config.ts",
        ],
    },

    js.configs.recommended,

    /*
     * This config file itself is CommonJS run by Node, and the globals
     * block below only covers src/ and scripts/.
     */
    {
        files: ["eslint.config.js", "scripts/**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                __dirname: "readonly",
                module: "writable",
                require: "readonly",
                process: "readonly",
                console: "readonly",
            },
        },
    },

    {
        files: ["src/**/*.js", "scripts/**/*.js"],

        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                __dirname: "readonly",
                __filename: "readonly",
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                module: "writable",
                require: "readonly",
                exports: "writable",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                fetch: "readonly",
                crypto: "readonly",
                AbortSignal: "readonly",
                TextEncoder: "readonly",
                structuredClone: "readonly",
                BigInt: "readonly",
                Intl: "readonly",
                Error: "readonly",
                globalThis: "readonly",
            },
        },

        rules: {
            "no-unused-vars": [
                "error",
                {
                    args: "none",
                    caughtErrors: "none",
                    varsIgnorePattern: "^_",
                },
            ],

            /*
             * Stylistic rules from the original config, kept as warnings
             * rather than errors. The v2 tree was written without a
             * linter running, so enforcing these today would block every
             * commit on reformatting; as warnings they still show up in
             * CI output and can be tightened once they reach zero.
             */
            "brace-style": ["warn", "stroustrup", { allowSingleLine: true }],
            "comma-dangle": ["warn", "always-multiline"],
            curly: ["warn", "multi-line", "consistent"],
            "no-var": "error",
            "prefer-const": "warn",
            "no-lonely-if": "warn",
            "no-multiple-empty-lines": ["warn", { max: 2, maxEOF: 1, maxBOF: 0 }],
            "no-trailing-spaces": "warn",
            semi: ["warn", "always"],
            "space-before-blocks": "warn",
        },
    },
];
