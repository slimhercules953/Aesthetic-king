import aestheticsCatalog from "../../src/data/aesthetics.json";
import symbolsCatalog from "../../src/data/symbols.json";

import type { AssetCatalogSet } from "./assetCatalog";
import { ExpectedError } from "./apiError";
import {
    CATALOG_COLOR_HEX,
    COMPLETABLE_COLOR_NAMES,
} from "./completionColors";
import {
    getAestheticOption,
    isValidAestheticId,
} from "./aesthetics";
import {
    getMoodOption,
    isValidMoodId,
} from "./moods";
import {
    PROFILE_LIMITS,
    clampText,
    emptyDraft,
    normalizeHex,
    normalizePalette,
    normalizeSymbols,
    type ProfileDraft,
} from "./profileModel";

/*
 * "Complete My Profile" turns one thing the user already likes — a set, an
 * aesthetic, a color, or a palette they saved — into a whole identity:
 * matching assets, a coordinated palette, symbols, a bio, a status and a
 * username.
 *
 * This module is deliberately pure: it takes a catalog, a seed and an
 * optional random source, and returns a draft. No database, no env, no
 * Ollama. That keeps every judgment call (which set matches which color,
 * which catalog aesthetic the Studio can actually render) in one file a
 * plain Node script can exercise exhaustively, and leaves the slow,
 * failure-prone AI enrichment in `profileCompletion.ts`, where it can fail
 * without taking the deterministic half down with it.
 */

type AestheticEntry = {
    id: string;
    name: string;
    description?: string;
    moods?: string[];
    colors?: string[];
    symbols?: string[];
};

const AESTHETIC_PALETTES = aestheticsCatalog as Record<
    string,
    AestheticEntry
>;

type SymbolGroup = {
    singles: string[];
    combinations: string[];
    dividers: string[];
};

const SYMBOL_CATALOG = symbolsCatalog as Record<
    string,
    SymbolGroup
>;

const FALLBACK_AESTHETIC = "gothic";
const FALLBACK_SYMBOL_KEY = "gothic";

/**
 * Catalog color tags are words ("indigo", "cream") but a palette is hex.
 * The table lives in `completionColors.ts` so the Builder's seed picker can
 * read the list of names without importing this module, which pulls in
 * `next/server` through `apiError.ts`.
 */
export { COMPLETABLE_COLOR_NAMES };

/**
 * Small fragments so two Gothic users with the same seed do not both read
 * "Gothic. Dark, dramatic, mysterious, and elegant." Keyed by mood, because
 * mood is the narrower of the two axes and the one the user chose.
 */
const MOOD_FLAVOUR: Record<string, string[]> = {
    dreamy: ["half asleep", "still dreaming", "soft focus", "somewhere else"],
    soft: ["gently", "quietly", "softly spoken", "at ease"],
    romantic: ["all heart", "in love with everything", "devoted", "hopeless"],
    moody: ["in a mood", "low light", "midnight energy", "not answering"],
    mysterious: ["unlisted", "hard to find", "read the room", "off the record"],
    energetic: ["loud on purpose", "full volume", "always moving", "chaotic good"],
    calm: ["unbothered", "steady", "slow mornings", "at peace"],
    elegant: ["with intention", "tailored", "quiet luxury", "never rushed"],
    dramatic: ["main character", "make it count", "all in", "the whole scene"],
    eerie: ["something is off", "static", "do not look back", "fading"],
    nostalgic: ["rewinding", "older than I look", "on repeat", "1998 forever"],
    peaceful: ["do not disturb", "quiet hours", "breathing", "offline in spirit"],
    minimal: ["less", "nothing to add", "plain text", "just this"],
};

const DEFAULT_FLAVOUR = [
    "currently here",
    "no context",
    "on purpose",
    "for now",
];

/**
 * Username halves. The noun comes from the aesthetic and the adjective from
 * the mood, so every pairing reads as though it was written for that
 * combination rather than drawn from one shared list.
 */
const AESTHETIC_NOUNS: Record<string, string[]> = {
    gothic: ["crypt", "vespers", "rosewindow", "requiem"],
    dark: ["static", "void", "signal", "ash"],
    horror: ["frequency", "basement", "moths", "tape"],
    nature: ["fern", "thicket", "riverstone", "moss"],
    luxury: ["velvet", "marble", "champagne", "gilt"],
    grunge: ["flannel", "feedback", "kerbside", "stubs"],
    monochrome: ["graphite", "silver", "slate", "chalk"],
    kawaii: ["mochi", "bunny", "pudding", "peach"],
    pastel: ["confetti", "gelato", "bubblegum", "sticker"],
    dreamcore: ["liminal", "daybed", "hazer", "sleepwalk"],
    cyber: ["chrome", "circuit", "neon", "protocol"],
    vaporwave: ["palm", "sunset", "elevator", "statue"],
    cottagecore: ["honey", "hearth", "orchard", "linen"],
    minimalist: ["margin", "grid", "paper", "line"],
    y2k: ["flipphone", "bubble", "chromeheart", "chatlog"],
    romantic: ["letter", "peony", "waltz", "ribbon"],
    soft: ["cardigan", "warmth", "cocoa", "quilt"],
    anime: ["shrine", "ramune", "aftermath", "opening"],
};

const DEFAULT_NOUNS = ["echo", "halo", "drift", "ember"];

const MOOD_ADJECTIVES: Record<string, string[]> = {
    dreamy: ["hazy", "lucid", "floaty", "drowsy"],
    soft: ["muted", "tender", "gentle", "pale"],
    romantic: ["velvet", "golden", "devoted", "old"],
    moody: ["noir", "shadow", "after", "hollow"],
    mysterious: ["hidden", "nameless", "buried", "quiet"],
    energetic: ["electric", "hyper", "bright", "wired"],
    calm: ["still", "level", "slow", "clear"],
    elegant: ["gilt", "tailored", "fine", "noble"],
    dramatic: ["crimson", "grand", "final", "bold"],
    eerie: ["hollow", "faded", "strange", "cold"],
    nostalgic: ["retro", "vhs", "older", "replayed"],
    peaceful: ["serene", "quiet", "still", "open"],
    minimal: ["plain", "bare", "clean", "flat"],
};

const DEFAULT_ADJECTIVES = ["soft", "dark", "warm", "cold"];

export type CompletionSeed =
    | { kind: "profileSet"; id: string }
    | { kind: "aesthetic"; id: string }
    | { kind: "color"; name: string }
    | { kind: "palette"; colors: string[] };

export type ComposeProfileInput = {
    seed: CompletionSeed;

    /**
     * Already filtered for premium status and for having resolvable art.
     * The composer trusts this — the caller holds the entitlement, and a
     * pure function should not re-decide who may use a set.
     */
    sets: AssetCatalogSet[];

    /**
     * What the user has typed so far. Anything already filled in survives:
     * "Complete My Profile" finishes a profile, it does not replace one.
     */
    existing?: Partial<ProfileDraft> | null;

    /**
     * The set the user was just offered. A reroll passes the previous pick
     * so the same identity cannot come back twice.
     */
    excludeSetId?: string | null;

    /** Injectable so tests can pin the randomness. */
    random?: () => number;
};

export type ComposedProfile = {
    draft: ProfileDraft;

    /** The set that was chosen, or null when none could be picked. */
    set: AssetCatalogSet | null;

    /** The Studio-valid aesthetic the composition settled on. */
    aestheticId: string;

    moodId: string | null;

    /** Field names this call wrote, so the UI can say what changed. */
    filled: string[];
};

function makeRandom(source?: () => number): () => number {
    return typeof source === "function" ? source : Math.random;
}

function pick<T>(items: T[], random: () => number): T {
    const safe = Math.min(Math.max(random(), 0), 0.999999);

    return items[Math.floor(safe * items.length)];
}

function slug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/**
 * The catalog's one-line description of an aesthetic, e.g. "Cute, playful,
 * colorful, and cheerful."
 *
 * The AI prompt needs this. `AESTHETICS` in `lib/aesthetics.ts` carries only
 * an id and a display name, so without it the model is asked to write "in
 * the Kawaii aesthetic" and must guess what that means — and it guesses from
 * whatever else happens to be in the prompt.
 */
export function getAestheticDescription(
    aestheticId: string | null | undefined
): string | null {
    if (!aestheticId) {
        return null;
    }

    const description = String(
        AESTHETIC_PALETTES[
            aestheticId.trim().toLowerCase()
        ]?.description ?? ""
    ).trim();

    return description.length > 0 ? description : null;
}

/**
 * Catalog color names to hex. Unknown names return null so the caller can
 * ignore them rather than invent a color.
 */
export function catalogColorToHex(
    name: string | null | undefined
): string | null {
    const key = String(name ?? "")
        .trim()
        .toLowerCase();

    return CATALOG_COLOR_HEX[key] ?? null;
}

function hexToRgb(hex: string): {
    r: number;
    g: number;
    b: number;
} {
    const digits = hex.replace("#", "");

    const full =
        digits.length === 3
            ? digits
                .split("")
                .map((c) => c + c)
                .join("")
            : digits.padEnd(6, "0").slice(0, 6);

    return {
        r: parseInt(full.slice(0, 2), 16) || 0,
        g: parseInt(full.slice(2, 4), 16) || 0,
        b: parseInt(full.slice(4, 6), 16) || 0,
    };
}

function colorDistance(a: string, b: string): number {
    const one = hexToRgb(a);
    const two = hexToRgb(b);

    return (
        (one.r - two.r) ** 2 +
        (one.g - two.g) ** 2 +
        (one.b - two.b) ** 2
    );
}

function paletteOf(aestheticKey: string): string[] {
    const colors = AESTHETIC_PALETTES[aestheticKey]?.colors;

    return Array.isArray(colors)
        ? colors.filter(
            (color) => normalizeHex(color) !== null
        )
        : [];
}

/**
 * Every aesthetic the bot knows, including the ones the Studio's dropdown
 * does not offer (`dark`, `horror`, `grunge`, `minimalist`, `monochrome`,
 * `soft`) — the bot ships those for its own commands.
 */
const CATALOG_AESTHETIC_KEYS = Object.keys(
    AESTHETIC_PALETTES
);

const AESTHETIC_FALLBACK_CACHE = new Map<string, string>();

/**
 * The Studio can only render the aesthetics in its own list, so a catalog
 * set tagged `horror` has to become something displayable. Rather than a
 * hand-maintained table that drifts from the palettes, this picks the
 * Studio aesthetic whose own palette sits closest to the unmapped one —
 * which puts horror next to gothic for free, and keeps working when a
 * palette is edited.
 */
function toStudioAesthetic(
    id: string | null | undefined
): string {
    const key = String(id ?? "")
        .trim()
        .toLowerCase();

    if (isValidAestheticId(key)) {
        return key;
    }

    const cached = AESTHETIC_FALLBACK_CACHE.get(key);
    if (cached) {
        return cached;
    }

    const source = paletteOf(key);
    const anchor =
        source.length > 0
            ? source[Math.floor(source.length / 2)]
            : null;

    let best = FALLBACK_AESTHETIC;

    if (anchor) {
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const candidate of CATALOG_AESTHETIC_KEYS) {
            if (!isValidAestheticId(candidate)) {
                continue;
            }

            for (const color of paletteOf(candidate)) {
                const distance = colorDistance(anchor, color);

                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = candidate;
                }
            }
        }
    }

    AESTHETIC_FALLBACK_CACHE.set(key, best);

    return best;
}

/**
 * Chooses the aesthetic a color belongs to by comparing it against every
 * palette the bot ships. Closest swatch wins, which keeps a deep burgundy
 * in Gothic rather than in Pastel.
 */
function aestheticForHex(hex: string): string {
    let best = FALLBACK_AESTHETIC;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of CATALOG_AESTHETIC_KEYS) {
        if (!isValidAestheticId(candidate)) {
            continue;
        }

        for (const color of paletteOf(candidate)) {
            const distance = colorDistance(hex, color);

            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
    }

    return best;
}

/**
 * `y2k` has no symbol block in the catalog, and a profile with no symbols
 * fails completeness, so a couple of aesthetics borrow the nearest list
 * rather than shipping a duplicate set of glyphs.
 */
const SYMBOL_ALIASES: Record<string, string> = {
    y2k: "pastel",
    vaporwave: "pastel",
    dark: "gothic",
    horror: "gothic",
    grunge: "gothic",
    minimalist: "monochrome",
};

function symbolGroupsFor(aestheticId: string): SymbolGroup {
    const key = String(aestheticId ?? "")
        .trim()
        .toLowerCase();

    const lookup = (name: string): SymbolGroup | null => {
        const groups = SYMBOL_CATALOG[name];

        if (!groups) {
            return null;
        }

        return {
            singles: Array.isArray(groups.singles)
                ? groups.singles
                : [],
            combinations: Array.isArray(groups.combinations)
                ? groups.combinations
                : [],
            dividers: Array.isArray(groups.dividers)
                ? groups.dividers
                : [],
        };
    };

    return (
        lookup(key) ??
        lookup(SYMBOL_ALIASES[key] ?? "") ??
        lookup(FALLBACK_SYMBOL_KEY) ?? {
        singles: [],
        combinations: [],
        dividers: [],
    }
    );
}

function flattenSymbols(groups: SymbolGroup): string[] {
    return [
        ...groups.singles,
        ...groups.combinations,
        ...groups.dividers,
    ].filter(
        (symbol) =>
            typeof symbol === "string" &&
            symbol.trim().length > 0
    );
}

function setColorsAsHex(
    set: AssetCatalogSet | null
): string[] {
    return (set?.colors ?? [])
        .map(catalogColorToHex)
        .filter((hex): hex is string => hex !== null);
}

function validMoods(values: unknown): string[] {
    return (Array.isArray(values) ? values : [])
        .map((mood) =>
            String(mood ?? "")
                .trim()
                .toLowerCase()
        )
        .filter(isValidMoodId);
}

/**
 * The catalog carries moods the Studio does not offer ("night",
 * "shadowy"), so filter before choosing. The aesthetic's own mood list is
 * the next best signal; after that the field is simply left empty, because
 * a wrong mood is worse than no mood.
 */
function resolveMood(
    set: AssetCatalogSet | null,
    aestheticId: string,
    random: () => number
): string | null {
    const fromSet = validMoods(set?.moods);

    if (fromSet.length > 0) {
        return pick(fromSet, random);
    }

    const fromAesthetic = validMoods(
        AESTHETIC_PALETTES[aestheticId]?.moods
    );

    if (fromAesthetic.length > 0) {
        return pick(fromAesthetic, random);
    }

    return null;
}

function buildPalette(
    aestheticId: string,
    seedHexes: string[],
    random: () => number
): string[] {
    const base = paletteOf(aestheticId);

    if (seedHexes.length >= 2) {
        const extras = base.filter(
            (color) => !seedHexes.includes(color)
        );

        return normalizePalette([
            ...seedHexes,
            ...extras.slice(0, Math.max(0, 5 - seedHexes.length)),
        ]);
    }

    if (seedHexes.length === 1) {
        const anchor = seedHexes[0];

        const rest = [...base].sort(
            (a, b) =>
                colorDistance(anchor, a) -
                colorDistance(anchor, b)
        );

        return normalizePalette([
            anchor,
            ...rest.slice(1, 5),
        ]);
    }

    // Rotate so repeated rolls of the same aesthetic differ instead of
    // handing back the identical five colors every time.
    const offset =
        base.length > 0
            ? Math.floor(random() * base.length)
            : 0;

    const rotated = [
        ...base.slice(offset),
        ...base.slice(0, offset),
    ];

    return normalizePalette(rotated.slice(0, 5));
}

function buildUsername(
    aestheticId: string,
    moodId: string | null,
    random: () => number
): string {
    const adjective = pick(
        MOOD_ADJECTIVES[moodId ?? ""] ?? DEFAULT_ADJECTIVES,
        random
    );

    const noun = pick(
        AESTHETIC_NOUNS[aestheticId] ?? DEFAULT_NOUNS,
        random
    );

    return (
        clampText(
            `${slug(adjective)}${slug(noun)}`,
            PROFILE_LIMITS.username
        ) ?? "profile"
    );
}

function buildBio(
    aestheticId: string,
    moodId: string | null,
    random: () => number
): string {
    const flavor = pick(
        MOOD_FLAVOUR[moodId ?? ""] ?? DEFAULT_FLAVOUR,
        random
    );

    const description = String(
        AESTHETIC_PALETTES[aestheticId]?.description ?? ""
    )
        .replace(/\.$/, "")
        .toLowerCase();

    /*
     * The label names the aesthetic, not the mood. The description on the
     * rest of the line belongs to the aesthetic, and pairing it with the
     * mood produced sentences that argued with themselves — a Gothic set
     * tagged "calm" read as "Calm energy — dark, dramatic, mysterious",
     * which is two different profiles in one bio. The mood still leads the
     * line through the flavor phrase above it.
     */
    const label =
        getAestheticOption(aestheticId)?.name ??
        getMoodOption(moodId)?.name ??
        "aesthetic";

    const sentence = description
        ? `${flavor}. ${label} energy — ${description}.`
        : `${flavor}. ${label} energy.`;

    return clampText(sentence, PROFILE_LIMITS.bio) ?? flavor;
}

function buildStatus(
    aestheticId: string,
    moodId: string | null,
    random: () => number
): string {
    const flavor = pick(
        MOOD_FLAVOUR[moodId ?? ""] ?? DEFAULT_FLAVOUR,
        random
    );

    const { singles } = symbolGroupsFor(aestheticId);

    const symbol =
        singles.length > 0
            ? ` ${pick(singles, random)}`
            : "";

    return (
        clampText(
            `${flavor}${symbol}`,
            PROFILE_LIMITS.status
        ) ?? flavor
    );
}

/**
 * Picks a set for the seed and fills every field the user left empty.
 *
 * Throws `ExpectedError` when the catalog cannot satisfy the seed, so the
 * route answers with a sentence rather than a 500.
 */
export function composeProfileDraft(
    input: ComposeProfileInput
): ComposedProfile {
    const random = makeRandom(input.random);
    const existing = input.existing ?? {};
    const sets = Array.isArray(input.sets)
        ? input.sets
        : [];

    if (sets.length === 0) {
        throw new ExpectedError(
            "There are no profile sets available to build from yet."
        );
    }

    const draft: ProfileDraft = {
        ...emptyDraft(),
        ...existing,
        symbols: [...(existing.symbols ?? [])],
        palette: [...(existing.palette ?? [])],
    };

    const filled: string[] = [];
    const seed = input.seed;

    let aestheticId = FALLBACK_AESTHETIC;
    let seedHexes: string[] = [];
    let chosen: AssetCatalogSet | null = null;

    const chooseFrom = (
        pool: AssetCatalogSet[]
    ): AssetCatalogSet | null => {
        if (pool.length === 0) {
            return null;
        }

        const fresh =
            input.excludeSetId && pool.length > 1
                ? pool.filter(
                    (set) => set.id !== input.excludeSetId
                )
                : pool;

        return pick(
            fresh.length > 0 ? fresh : pool,
            random
        );
    };

    if (seed.kind === "profileSet") {
        chosen =
            sets.find((set) => set.id === seed.id) ?? null;

        if (!chosen) {
            throw new ExpectedError(
                "That profile set is not available to you."
            );
        }

        aestheticId = toStudioAesthetic(
            chosen.aesthetics?.[0]
        );
        seedHexes = setColorsAsHex(chosen);
    } else if (seed.kind === "aesthetic") {
        const wanted = String(seed.id ?? "")
            .trim()
            .toLowerCase();

        aestheticId = toStudioAesthetic(wanted);

        const direct = sets.filter((set) =>
            (set.aesthetics ?? []).some(
                (tag) =>
                    String(tag ?? "")
                        .trim()
                        .toLowerCase() === wanted
            )
        );

        chosen = chooseFrom(
            direct.length > 0 ? direct : sets
        );
        seedHexes = setColorsAsHex(chosen);
    } else if (seed.kind === "color") {
        const hex = catalogColorToHex(seed.name);

        if (!hex) {
            throw new ExpectedError(
                "I don't know that color yet. Pick one of the colors in the picker."
            );
        }

        seedHexes = [hex];
        aestheticId = aestheticForHex(hex);

        const matching = sets.filter((set) =>
            setColorsAsHex(set).includes(hex)
        );

        chosen = chooseFrom(
            matching.length > 0 ? matching : sets
        );
    } else {
        const colors = normalizePalette(
            seed.colors ?? []
        );

        if (colors.length === 0) {
            throw new ExpectedError(
                "Pick at least one color before completing from a palette."
            );
        }

        seedHexes = colors;
        aestheticId = aestheticForHex(colors[0]);

        /*
         * Rank sets by how close their own color tags are to the palette
         * the user saved, then choose among the nearest few. Ranking rather
         * than filtering means an unusual palette still gets a set instead
         * of an error.
         */
        const scored = sets
            .map((set) => {
                const hexes = setColorsAsHex(set);

                const distance =
                    hexes.length > 0
                        ? Math.min(
                            ...colors.map((color) =>
                                Math.min(
                                    ...hexes.map((hex) =>
                                        colorDistance(
                                            color,
                                            hex
                                        )
                                    )
                                )
                            )
                        )
                        : Number.POSITIVE_INFINITY;

                return { set, distance };
            })
            .filter((entry) =>
                Number.isFinite(entry.distance)
            )
            .sort((a, b) => a.distance - b.distance);

        const pool =
            scored.length > 0
                ? scored
                    .slice(0, 8)
                    .map((entry) => entry.set)
                : sets;

        chosen = chooseFrom(pool);
    }

    const moodId = resolveMood(
        chosen,
        aestheticId,
        random
    );

    /*
     * Only overwrite what the user left empty. The Builder autosaves, so by
     * the time someone presses this they may well have written a bio —
     * silently replacing it would be the fastest way to lose their trust.
     */
    const fill = (
        key: "username" | "bio" | "status",
        value: string | null
    ): void => {
        if (!value) {
            return;
        }

        const current = draft[key];
        const hasValue =
            typeof current === "string" &&
            current.trim().length > 0;

        if (!hasValue) {
            draft[key] = value;
            filled.push(key);
        }
    };

    if (chosen) {
        draft.profileSetId = chosen.id;
        filled.push("profileSetId");
    }

    fill(
        "username",
        buildUsername(aestheticId, moodId, random)
    );
    fill("bio", buildBio(aestheticId, moodId, random));
    fill(
        "status",
        buildStatus(aestheticId, moodId, random)
    );

    if (normalizePalette(draft.palette).length < 2) {
        draft.palette = buildPalette(
            aestheticId,
            seedHexes,
            random
        );
        filled.push("palette");
    }

    if (normalizeSymbols(draft.symbols).length === 0) {
        const all = flattenSymbols(
            symbolGroupsFor(aestheticId)
        );

        if (all.length > 0) {
            const offset = Math.floor(
                random() * all.length
            );

            const rotated = [
                ...all.slice(offset),
                ...all.slice(0, offset),
            ];

            draft.symbols = normalizeSymbols(
                rotated.slice(0, 4)
            );
            filled.push("symbols");
        }
    }

    if (!normalizeHex(draft.accentColor)) {
        const palette = normalizePalette(draft.palette);

        draft.accentColor =
            palette.length > 1
                ? palette[1]
                : palette[0] ?? null;

        if (draft.accentColor) {
            filled.push("accentColor");
        }
    }

    if (!draft.name?.trim()) {
        draft.name =
            getAestheticOption(aestheticId)?.name ??
            "New profile";
        filled.push("name");
    }

    return {
        draft,
        set: chosen,
        aestheticId,
        moodId,
        filled,
    };
}
