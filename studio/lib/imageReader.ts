import { ExpectedError } from "./apiError";
import { generateOllamaText } from "./ollama";
import { getAssetCatalogFilters } from "./assetCatalog";
import { selectMatchingProfileSet } from "./profileSetSelector";
import {
    describePalette,
    isValidHex,
    type PaletteRead,
} from "./imageColor";

/**
 * Turns a palette sampled in the browser into a named aesthetic.
 *
 * The pixels are read client-side (Workers have no image decoder), so
 * everything here works from the hex list alone: the model names the
 * vibe, and the existing catalog matcher picks a real profile set.
 */

export type ReadImagePaletteInput = {
    palette: string[];
    request?: string | null;

    /**
     * Image-to-Aesthetic and Premium Assets are separate entitlements
     * - a Crown unlock opens one but not the other - so the matched
     * set has to respect the asset library too.
     */
    premiumUnlocked?: boolean;
};

export type ImageReading = {
    generationId: string;

    aestheticId: string;
    moodId: string | null;
    colorFilter: string | null;

    profileSetId: string;

    usernameIdea: string;
    bio: string;
    status: string;

    symbols: string[];
    palette: string[];

    /**
     * The palette exactly as sampled, before the model tidied it, so
     * the UI can show both.
     */
    sampledPalette: string[];

    read: PaletteRead;
};

type OllamaReading = {
    aestheticId?: unknown;
    moodId?: unknown;
    colorFilter?: unknown;
    usernameIdea?: unknown;
    bio?: unknown;
    status?: unknown;
    symbols?: unknown;
    palette?: unknown;
};

function extractJson(value: string) {
    const withoutFences = value
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    const start = withoutFences.indexOf("{");
    const end = withoutFences.lastIndexOf("}");

    if (start === -1 || end === -1 || end < start) {
        throw new ExpectedError(
            "The reading service did not return valid JSON."
        );
    }

    return withoutFences.slice(start, end + 1);
}

/**
 * Keeps only values the catalog can actually serve, so a model that
 * invents "cottagegoblin" cannot produce an unsatisfiable request.
 */
function restrict(
    value: unknown,
    allowed: string[]
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim().toLowerCase();

    return allowed.includes(normalized)
        ? normalized
        : null;
}

function normalizePalette(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(isValidHex)
        .map((hex) => hex.toUpperCase())
        .slice(0, 6);
}

export function normalizeSampledPalette(
    value: unknown
): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter(isValidHex)
        .map((hex) => hex.toUpperCase());
}

export async function readImagePalette({
    palette,
    request = null,
    premiumUnlocked = false,
}: ReadImagePaletteInput): Promise<ImageReading> {
    const sampled = normalizeSampledPalette(palette);

    if (sampled.length < 3) {
        throw new ExpectedError(
            "At least 3 sampled colours are required."
        );
    }

    if (sampled.length > 6) {
        throw new ExpectedError(
            "A palette can hold at most 6 colours."
        );
    }

    const filters = getAssetCatalogFilters();
    const read = describePalette(sampled);

    const cleanRequest =
        request?.trim().slice(0, 500) || null;

    const prompt = [
        "You are the creative engine for Aesthetic King, a Discord profile aesthetic application.",
        "",
        "A user uploaded an image. Its dominant colours were sampled from the pixels and given to you in order of how much of the image they cover.",
        "",
        "SAMPLED PALETTE:",
        sampled.join(", "),
        "",
        "OVERALL READ:",
        read.brightness + " " + read.intensity,
        "",
        "USER REQUEST:",
        cleanRequest ?? "No additional request.",
        "",
        "Choose the single best label for this palette from each list. You must copy values from the lists verbatim.",
        "",
        "AESTHETIC OPTIONS:",
        filters.aesthetics.join(", "),
        "",
        "MOOD OPTIONS:",
        filters.moods.join(", "),
        "",
        "COLOR OPTIONS:",
        filters.colors.join(", "),
        "",
        "Return ONLY valid JSON.",
        "Do not use Markdown. Do not use code fences. Do not explain your answer.",
        "Use exactly this structure:",
        "",
        "{",
        '  "aestheticId": "string",',
        '  "moodId": "string",',
        '  "colorFilter": "string",',
        '  "usernameIdea": "string",',
        '  "bio": "string",',
        '  "status": "string",',
        '  "symbols": ["string", "string", "string"],',
        '  "palette": ["#000000", "#000000", "#000000"]',
        "}",
        "",
        "RULES:",
        "",
        "- aestheticId, moodId and colorFilter must each be one exact value from the matching list above.",
        "- usernameIdea should feel usable as a Discord username and be 32 characters or fewer.",
        "- bio should be expressive but concise, and 190 characters or fewer.",
        "- status must be 128 characters or fewer.",
        "- symbols should contain 3 to 6 decorative Unicode symbols that suit the palette.",
        "- palette must contain 3 to 6 valid six-digit hexadecimal colors derived from the sampled palette. You may adjust lightness slightly for cohesion but must stay recognisably the same colours.",
        "- Everything must feel cohesive with the sampled palette, not with a generic aesthetic.",
        "- Do not include asset URLs.",
        "- Do not include anything outside the JSON object.",
    ].join("\n");

    const response = await generateOllamaText(prompt);

    let parsed: OllamaReading;

    try {
        parsed = JSON.parse(
            extractJson(response)
        ) as OllamaReading;
    } catch {
        throw new ExpectedError(
            "The reading service returned malformed JSON."
        );
    }

    const aestheticId = restrict(
        parsed.aestheticId,
        filters.aesthetics
    );

    if (!aestheticId) {
        throw new ExpectedError(
            "That image could not be matched to a known aesthetic. Try again or describe it in the request box."
        );
    }

    const moodId = restrict(parsed.moodId, filters.moods);
    const colorFilter = restrict(
        parsed.colorFilter,
        filters.colors
    );

    if (
        typeof parsed.usernameIdea !== "string" ||
        typeof parsed.bio !== "string" ||
        typeof parsed.status !== "string"
    ) {
        throw new ExpectedError(
            "The reading service returned an incomplete result."
        );
    }

    const usernameIdea =
        parsed.usernameIdea.trim().slice(0, 32);
    const bio = parsed.bio.trim().slice(0, 190);
    const status = parsed.status.trim().slice(0, 128);

    const symbols = Array.isArray(parsed.symbols)
        ? parsed.symbols
            .filter(
                (value): value is string =>
                    typeof value === "string"
            )
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];

    // A palette the model invented is worse than the real pixels, so
    // fall back to what was actually sampled.
    const modelPalette = normalizePalette(parsed.palette);

    const finalPalette =
        modelPalette.length >= 3
            ? modelPalette
            : sampled.slice(0, 6);

    if (!usernameIdea || !bio || !status) {
        throw new ExpectedError(
            "The reading service returned an incomplete profile."
        );
    }

    let profileSet;

    try {
        profileSet = selectMatchingProfileSet({
            aestheticId,
            moodId,
            colorFilter,
            premiumUnlocked,
        });
    } catch {
        profileSet = selectMatchingProfileSet({
            aestheticId,
            premiumUnlocked,
        });
    }

    return {
        generationId: crypto.randomUUID(),

        aestheticId,
        moodId,
        colorFilter,

        profileSetId: profileSet.id,

        usernameIdea,
        bio,
        status,
        symbols,
        palette: finalPalette,

        sampledPalette: sampled,
        read,
    };
}
