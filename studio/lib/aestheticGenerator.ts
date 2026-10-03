import {
    ExpectedError,
} from "./apiError";

import {
    generateOllamaText,
} from "./ollama";

import {
    getAssetSets,
} from "./assetCatalog";
import {
    selectMatchingProfileSet,
} from "./profileSetSelector";

export type GenerateAestheticInput = {
    aestheticId: string;
    moodId?: string | null;
    colorFilter?: string | null;
    request?: string | null;
};

export type GeneratedAesthetic = {
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
};

type OllamaAestheticResult = {
    usernameIdea?: unknown;
    bio?: unknown;
    status?: unknown;
    symbols?: unknown;
    palette?: unknown;
};

function createGenerationId() {
    return crypto.randomUUID();
}

function cleanOptional(
    value?: string | null
) {
    const cleaned =
        value?.trim();

    return cleaned
        ? cleaned
        : null;
}

function normalizeHex(
    value: string
) {
    const cleaned =
        value
            .trim()
            .toUpperCase();

    if (
        /^#[0-9A-F]{6}$/.test(
            cleaned
        )
    ) {
        return cleaned;
    }

    return null;
}

function extractJson(
    value: string
) {
    const withoutFences =
        value
            .replace(
                /```json/gi,
                ""
            )
            .replace(
                /```/g,
                ""
            )
            .trim();

    const start =
        withoutFences.indexOf(
            "{"
        );

    const end =
        withoutFences.lastIndexOf(
            "}"
        );

    if (
        start === -1 ||
        end === -1 ||
        end < start
    ) {
        throw new ExpectedError(
            "Ollama did not return valid JSON."
        );
    }

    return withoutFences.slice(
        start,
        end + 1
    );
}

function validateResult(
    raw: OllamaAestheticResult
) {
    if (
        typeof raw.usernameIdea !==
        "string" ||
        typeof raw.bio !==
        "string" ||
        typeof raw.status !==
        "string"
    ) {
        throw new ExpectedError(
            "Ollama returned an incomplete aesthetic."
        );
    }

    const usernameIdea =
        raw.usernameIdea
            .trim()
            .slice(
                0,
                32
            );

    const bio =
        raw.bio
            .trim()
            .slice(
                0,
                190
            );

    const status =
        raw.status
            .trim()
            .slice(
                0,
                128
            );

    const symbols =
        Array.isArray(
            raw.symbols
        )
            ? raw.symbols
                .filter(
                    (
                        value
                    ): value is string =>
                        typeof value ===
                        "string"
                )
                .map(
                    (value) =>
                        value.trim()
                )
                .filter(Boolean)
                .slice(
                    0,
                    6
                )
            : [];

    const palette =
        Array.isArray(
            raw.palette
        )
            ? raw.palette
                .filter(
                    (
                        value
                    ): value is string =>
                        typeof value ===
                        "string"
                )
                .map(
                    normalizeHex
                )
                .filter(
                    (
                        value
                    ): value is string =>
                        Boolean(
                            value
                        )
                )
                .slice(
                    0,
                    6
                )
            : [];

    if (!usernameIdea) {
        throw new ExpectedError(
            "Ollama did not generate a username."
        );
    }

    if (!bio) {
        throw new ExpectedError(
            "Ollama did not generate a bio."
        );
    }

    if (!status) {
        throw new ExpectedError(
            "Ollama did not generate a status."
        );
    }

    if (
        palette.length <
        3
    ) {
        throw new ExpectedError(
            "Ollama did not generate a valid palette."
        );
    }

    return {
        usernameIdea,
        bio,
        status,
        symbols,
        palette,
    };
}

export async function generateAesthetic(
    input: GenerateAestheticInput
): Promise<GeneratedAesthetic> {
    const aestheticId =
        input.aestheticId
            .trim()
            .toLowerCase();

    if (!aestheticId) {
        throw new ExpectedError(
            "An aesthetic is required."
        );
    }

    const moodId =
        cleanOptional(
            input.moodId
        )?.toLowerCase() ??
        null;

    const colorFilter =
        cleanOptional(
            input.colorFilter
        )?.toLowerCase() ??
        null;

    const request =
        cleanOptional(
            input.request
        );

    const profileSet =
        selectMatchingProfileSet({
            aestheticId,
            moodId,
            colorFilter,
        });

    const prompt = `
You are the creative engine for Aesthetic King, a Discord profile aesthetic application.

Create ONE cohesive Discord profile concept.

AESTHETIC:
${aestheticId}

MOOD:
${moodId ?? "any"}

COLOR PREFERENCE:
${colorFilter ?? "any"}

USER REQUEST:
${request ?? "No additional request."}

The selected profile asset set has these metadata tags:

Aesthetics:
${profileSet.aesthetics.join(", ")}

Moods:
${profileSet.moods.join(", ")}

Colors:
${profileSet.colors.join(", ")}

Return ONLY valid JSON.

Do not use Markdown.
Do not use code fences.
Do not explain your answer.

Use exactly this structure:

{
  "usernameIdea": "string",
  "bio": "string",
  "status": "string",
  "symbols": ["string", "string", "string"],
  "palette": ["#000000", "#000000", "#000000"]
}

RULES:

- usernameIdea should feel usable as a Discord username.
- usernameIdea must be 32 characters or fewer.
- bio should be expressive but concise.
- bio must be 190 characters or fewer.
- status must be 128 characters or fewer.
- symbols should contain 3 to 6 decorative Unicode symbols.
- palette must contain 3 to 6 valid six-digit hexadecimal colors.
- Everything must feel cohesive with the requested aesthetic.
- Do not include asset URLs.
- Do not invent profile set IDs.
- Do not include anything outside the JSON object.
    `.trim();

    const response =
        await generateOllamaText(
            prompt
        );

    let parsed:
        OllamaAestheticResult;

    try {
        parsed =
            JSON.parse(
                extractJson(
                    response
                )
            ) as
            OllamaAestheticResult;
    } catch {
        throw new ExpectedError(
            "Ollama returned malformed aesthetic JSON."
        );
    }

    const validated =
        validateResult(
            parsed
        );

    return {
        generationId:
            createGenerationId(),

        aestheticId,
        moodId,
        colorFilter,

        profileSetId:
            profileSet.id,

        ...validated,
    };
}