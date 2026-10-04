/**
 * The Profile Builder's data model, as pure functions.
 *
 * Everything the Builder can produce has to pass through here before it
 * reaches the database, and everything the preview draws is derived
 * here rather than computed in JSX. Two reasons: the Studio runs on the
 * Workers runtime, where the bot's `node-canvas` profile renderer cannot
 * execute, so the preview is DOM/CSS and its inputs have to be computed
 * somewhere testable; and the same numbers are needed by the API route
 * (to reject a bad save) and by the form (to stop typing at the limit),
 * which must not be able to disagree.
 *
 * Lengths follow what Discord itself accepts, because a profile that
 * cannot be pasted into Discord is not worth building.
 */

export type ProfileDraft = {
    name: string;

    profileSetId: string | null;

    username: string | null;
    discriminator: string | null;
    pronouns: string | null;

    bio: string | null;
    status: string | null;

    symbols: string[];
    palette: string[];

    accentColor: string | null;
};

/**
 * Hard ceilings, in characters, per field.
 */
export const PROFILE_LIMITS = {
    name: 60,

    /** Discord global names are 1-32. */
    username: 32,

    /** A legacy discriminator is exactly 4 digits. */
    discriminator: 4,

    pronouns: 100,

    /** Discord's "About Me" box. */
    bio: 190,

    /** Discord's custom status. */
    status: 128,

    palette: 8,
    symbols: 12,
} as const;

export const MIN_PALETTE_COLORS = 2;

/**
 * How many saved versions a user without ADVANCED_PROFILE_BUILDER may
 * keep. One, which is the profile they are working on: the free tier
 * gets a builder, but not a library of versions.
 */
export const FREE_PROFILE_VERSIONS = 1;

export function clampText(
    value: unknown,
    max: number
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    // Count code points, not UTF-16 units. A single emoji is two units,
    // and slicing on `.length` cuts symbols in half — which matters here
    // because symbols and status text are exactly where people put them.
    const characters = [...trimmed];

    return characters
        .slice(0, max)
        .join("");
}

export function normalizeHex(
    value: unknown
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    let next = value.trim().toUpperCase();

    if (next && !next.startsWith("#")) {
        next = `#${next}`;
    }

    return /^#[0-9A-F]{6}$/.test(next)
        ? next
        : null;
}

/**
 * Cleans a palette: valid hex only, de-duplicated, capped.
 *
 * Order is preserved because a palette reads left-to-right as
 * primary → accent, and re-sorting it would silently repaint every
 * profile that was saved by hand.
 */
export function normalizePalette(
    value: unknown
): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();

    for (const entry of value) {
        const hex = normalizeHex(entry);

        if (hex) {
            seen.add(hex);
        }

        if (seen.size >= PROFILE_LIMITS.palette) {
            break;
        }
    }

    return [...seen];
}

/**
 * Cleans a symbol set: non-empty strings, de-duplicated, capped.
 *
 * Whitespace inside a symbol is kept — "♡ ⋆ ˚" is a single symbol the
 * user copied as a unit and splitting it would destroy it.
 */
export function normalizeSymbols(
    value: unknown
): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();

    for (const entry of value) {
        if (typeof entry !== "string") {
            continue;
        }

        const trimmed = entry.trim();

        if (trimmed) {
            seen.add(trimmed);
        }

        if (seen.size >= PROFILE_LIMITS.symbols) {
            break;
        }
    }

    return [...seen];
}

/**
 * Turns a symbol list into the string a user pastes into Discord.
 */
export function joinSymbols(
    symbols: string[]
): string {
    return symbols.join(" ");
}

export function normalizeDiscriminator(
    value: unknown
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const digits = value.replace(/\D/g, "");

    if (!digits) {
        return null;
    }

    return digits.slice(-PROFILE_LIMITS.discriminator);
}

export type ProfileValidationFailure = {
    ok: false;
    errors: string[];
};

export type ProfileValidationSuccess = {
    ok: true;
    value: ProfileDraft;
};

export type ProfileValidationResult =
    | ProfileValidationSuccess
    | ProfileValidationFailure;

/**
 * Validates and normalises anything the client sent into a `ProfileDraft`.
 *
 * Deliberately lenient about *shape* and strict about *meaning*: an
 * unknown key is dropped rather than rejected, and a field that is
 * merely too long is truncated rather than rejected, because the form
 * already prevents that and a stale tab should not fail to save. What
 * does fail is a profile that could not be drawn at all — no name, or a
 * palette too thin to build a card from.
 */
export function parseProfileInput(
    input: unknown,
    fallbackName = "Untitled profile"
): ProfileValidationResult {
    if (
        input === null ||
        typeof input !== "object" ||
        Array.isArray(input)
    ) {
        return {
            ok: false,
            errors: ["Expected a profile object."],
        };
    }

    const raw = input as Record<string, unknown>;

    const errors: string[] = [];

    const name =
        clampText(raw.name, PROFILE_LIMITS.name) ??
        fallbackName;

    const palette = normalizePalette(raw.palette);

    if (palette.length > 0 && palette.length < MIN_PALETTE_COLORS) {
        errors.push(
            `A palette needs at least ${MIN_PALETTE_COLORS} colors.`
        );
    }

    const profileSetId =
        typeof raw.profileSetId === "string" &&
        raw.profileSetId.trim()
            ? raw.profileSetId.trim().slice(0, 64)
            : null;

    if (!profileSetId && palette.length === 0) {
        errors.push(DRAFT_NEEDS_ART);
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        value: {
            name,
            profileSetId,

            username: clampText(
                raw.username,
                PROFILE_LIMITS.username
            ),

            discriminator: normalizeDiscriminator(
                raw.discriminator
            ),

            pronouns: clampText(
                raw.pronouns,
                PROFILE_LIMITS.pronouns
            ),

            bio: clampText(raw.bio, PROFILE_LIMITS.bio),
            status: clampText(raw.status, PROFILE_LIMITS.status),

            symbols: normalizeSymbols(raw.symbols),
            palette,

            accentColor: normalizeHex(raw.accentColor),
        },
    };
}

/**
 * Everything the preview needs, resolved from a draft.
 *
 * The component should not decide what to fall back to; it draws what
 * it is handed. That keeps the fallback rules in one place, and makes
 * "what does a profile with no set and two colors look like" a
 * question a test can answer.
 */
export type ProfilePreviewState = {
    /**
     * Banner color when no profile set supplies an image.
     */
    bannerColor: string;

    /**
     * Card body color. Dark on purpose — a profile card is a dark
     * surface in Discord, and tinting it keeps the aesthetic without
     * hurting legibility.
     */
    backgroundColor: string;

    /**
     * Ring around the avatar and the accent underline.
     */
    accentColor: string;

    /**
     * Primary text on `backgroundColor`.
     */
    textColor: string;

    /**
     * Secondary text on `backgroundColor`.
     */
    mutedTextColor: string;

    /**
     * Palette padded to at least two entries so the color bar always
     * renders as a bar rather than a single block.
     */
    palette: string[];

    /**
     * Name to display, after every fallback.
     */
    displayName: string;

    /**
     * `#1234` suffix, or null when the user left it blank.
     */
    discriminator: string | null;

    /**
     * One or two characters for the avatar placeholder.
     */
    initials: string;

    /**
     * True when the palette is too thin to be called finished.
     */
    incomplete: boolean;
};

const FALLBACK_PRIMARY = "#7C3AED";
const FALLBACK_SECONDARY = "#EC4899";
const FALLBACK_BACKGROUND = "#111214";

function hexToRgb(hex: string): {
    r: number;
    g: number;
    b: number;
} {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

function toHex(
    r: number,
    g: number,
    b: number
): string {
    const part = (value: number) =>
        Math.max(0, Math.min(255, Math.round(value)))
            .toString(16)
            .padStart(2, "0");

    return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/**
 * WCAG relative luminance, 0 (black) to 1 (white).
 */
export function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex);

    const channel = (value: number) => {
        const scaled = value / 255;

        return scaled <= 0.03928
            ? scaled / 12.92
            : ((scaled + 0.055) / 1.055) ** 2.4;
    };

    return (
        0.2126 * channel(r) +
        0.7152 * channel(g) +
        0.0722 * channel(b)
    );
}

/**
 * Mixes `hex` toward `target` by `amount` (0-1).
 */
export function mixHex(
    hex: string,
    target: string,
    amount: number
): string {
    const a = hexToRgb(hex);
    const b = hexToRgb(target);

    const blend = Math.max(0, Math.min(1, amount));

    return toHex(
        a.r + (b.r - a.r) * blend,
        a.g + (b.g - a.g) * blend,
        a.b + (b.b - a.b) * blend
    );
}

/**
 * Picks black or white text for `background`.
 *
 * Uses contrast *ratios* rather than a luminance threshold: a mid-tone
 * such as #808080 is close enough to either endpoint that a threshold
 * picks a color with roughly 3.9:1 contrast, which is unreadable.
 * Comparing both ratios and taking the winner is what actually reads.
 */
export function contrastTextColor(
    background: string,
    light = "#FFFFFF",
    dark = "#0B0B0D"
): string {
    const luminance = relativeLuminance(background);

    const ratio = (other: string) => {
        const otherLuminance = relativeLuminance(other);

        const lighter = Math.max(luminance, otherLuminance);
        const darker = Math.min(luminance, otherLuminance);

        return (lighter + 0.05) / (darker + 0.05);
    };

    return ratio(light) >= ratio(dark) ? light : dark;
}

export function initialsOf(
    value: string | null
): string {
    if (!value) {
        return "?";
    }

    const words = value
        .split(/[\s_\-|.]+/)
        .filter(Boolean);

    if (words.length === 0) {
        return "?";
    }

    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return (
        words[0][0] + words[1][0]
    ).toUpperCase();
}

/**
 * Resolves a draft into the state the preview draws.
 *
 * `fallbackUsername` is what a brand-new profile shows before the user
 * types anything — their Discord name — so the card never renders an
 * empty name slot.
 */
export function derivePreviewState(
    draft: ProfileDraft,
    fallbackUsername: string | null = null
): ProfilePreviewState {
    const palette = normalizePalette(draft.palette);

    const primary =
        palette[0] ?? FALLBACK_PRIMARY;

    const secondary =
        palette[1] ?? palette[0] ?? FALLBACK_SECONDARY;

    const accent =
        normalizeHex(draft.accentColor) ?? secondary;

    const displayName =
        draft.username ??
        fallbackUsername?.trim() ??
        null;

    const name = displayName ?? "your name";

    const backgroundColor = mixHex(
        primary,
        FALLBACK_BACKGROUND,
        0.88
    );

    const textColor = contrastTextColor(backgroundColor);

    return {
        bannerColor: primary,
        backgroundColor,
        accentColor: accent,

        textColor,

        // Rather than a second contrast pass, dim the chosen text color
        // toward the card. It keeps one readable hue instead of
        // introducing a color that only passes on its own.
        mutedTextColor: mixHex(
            textColor,
            backgroundColor,
            0.45
        ),

        palette:
            palette.length >= 2
                ? palette
                : [primary, secondary],

        displayName: name,

        discriminator: draft.discriminator
            ? `#${draft.discriminator}`
            : null,

        initials: draft.username
            ? initialsOf(draft.username)
            : initialsOf(fallbackUsername),

        incomplete: palette.length < MIN_PALETTE_COLORS,
    };
}

/**
 * Whether a draft is a complete-enough profile to hand to
 * "Complete My Profile" / apply flows.
 *
 * Kept separate from validation: an incomplete profile is still
 * saveable — it is work in progress — but the UI should say so.
 */
export type ProfileCompleteness = {
    complete: boolean;
    missing: string[];
};

export function checkCompleteness(
    draft: ProfileDraft
): ProfileCompleteness {
    const missing: string[] = [];

    if (!draft.username) {
        missing.push("username");
    }

    if (!draft.profileSetId) {
        missing.push("profile set");
    }

    if (draft.palette.length < MIN_PALETTE_COLORS) {
        missing.push("palette");
    }

    if (!draft.bio) {
        missing.push("bio");
    }

    if (!draft.status) {
        missing.push("status");
    }

    if (draft.symbols.length === 0) {
        missing.push("symbols");
    }

    return {
        complete: missing.length === 0,
        missing,
    };
}

/**
 * The message shown when a draft has nothing to paint with. Exported so
 * the Builder can say the same thing the API would have said, rather
 * than inventing its own wording for the same rule.
 */
export const DRAFT_NEEDS_ART =
    "Pick a profile set or add colors before saving.";

/**
 * Whether a draft is worth sending to the server at all.
 *
 * This is deliberately weaker than `checkCompleteness`: completeness
 * describes a *finished* profile, and most drafts are unfinished on the
 * way there. This asks only the question `parseProfileInput` asks — does
 * the card have anything to paint with? — because that is the one rule
 * the API enforces, and a draft failing it is guaranteed to come back a
 * 400.
 *
 * The Builder needs this separately from the API because it autosaves.
 * Without it, typing a display name into a brand-new profile fires a
 * request that cannot succeed, and the user is shown an error for
 * something they never asked to save.
 */
export function canSaveDraft(draft: ProfileDraft): boolean {
    return (
        draft.profileSetId !== null ||
        draft.palette.length >= MIN_PALETTE_COLORS
    );
}

/**
 * The default draft for a new profile, seeded from whatever the user
 * started from so the Builder never opens blank.
 */
export function emptyDraft(
    overrides: Partial<ProfileDraft> = {}
): ProfileDraft {
    return {
        name: "Untitled profile",
        profileSetId: null,

        username: null,
        discriminator: null,
        pronouns: null,

        bio: null,
        status: null,

        symbols: [],
        palette: [],

        accentColor: null,

        ...overrides,
    };
}
