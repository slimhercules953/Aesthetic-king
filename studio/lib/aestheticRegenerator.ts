import {
    ExpectedError,
} from "./apiError";

import {
    generateOllamaText,
} from "./ollama";

import {
    resolveColorTag,
    resolveMoodTag,
} from "./moods";
import {
    selectMatchingProfileSet,
} from "./profileSetSelector";

export type RegenerationTarget =
    | "username"
    | "bio"
    | "status"
    | "palette"
    | "symbols"
    | "profileSet";

export type RegenerateAestheticInput = {
    target: RegenerationTarget;

    aestheticId: string;
    moodId?: string | null;
    colorFilter?: string | null;
    request?: string | null;

    profileSetId: string;

    usernameIdea: string;
    bio: string;
    status: string;

    symbols: string[];
    palette: string[];

    premiumUnlocked?: boolean;
};

function extractJson(
    value: string
) {
    const cleaned =
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
        cleaned.indexOf("{");

    const end =
        cleaned.lastIndexOf("}");

    if (
        start === -1 ||
        end === -1 ||
        end < start
    ) {
        throw new ExpectedError(
            "Ollama did not return valid JSON."
        );
    }

    return cleaned.slice(
        start,
        end + 1
    );
}

function normalizeHex(
    value: string
) {
    const cleaned =
        value
            .trim()
            .toUpperCase();

    return /^#[0-9A-F]{6}$/.test(
        cleaned
    )
        ? cleaned
        : null;
}

async function generateJson(
    prompt: string
) {
    const response =
        await generateOllamaText(
            prompt
        );

    try {
        return JSON.parse(
            extractJson(
                response
            )
        ) as Record<
            string,
            unknown
        >;
    } catch {
        throw new ExpectedError(
            "Ollama returned malformed JSON."
        );
    }
}

function cleanOptional(
    value?: string | null
) {
    const cleaned =
        value?.trim().toLowerCase();

    return cleaned || null;
}

function buildContext(
    input: RegenerateAestheticInput
) {
    return `
Aesthetic: ${input.aestheticId}
Mood: ${input.moodId ?? "any"}
Color preference: ${input.colorFilter ?? "any"}
User request: ${input.request ?? "none"}

Current username:
${input.usernameIdea}

Current bio:
${input.bio}

Current status:
${input.status}

Current palette:
${input.palette.join(", ")}

Current symbols:
${input.symbols.join(" ")}
    `.trim();
}

export async function regenerateAestheticPart(
    input: RegenerateAestheticInput
) {
    if (
        input.target ===
        "profileSet"
    ) {
        const profileSet =
            selectMatchingProfileSet({
                aestheticId:
                    input.aestheticId,

                moodId:
                    input.moodId,

                colorFilter:
                    input.colorFilter,

                excludeSetId:
                    input.profileSetId,

                premiumUnlocked:
                    input.premiumUnlocked ?? false,
            });

        /*
         * A new set is a new mood and colour, so the resolved tags travel
         * back with it. The client merges this object over the current
         * result, which keeps the saved record in step with whatever the
         * profile actually looks like now. A filter the user picked still
         * wins — the set was chosen to match it.
         */
        return {
            profileSetId:
                profileSet.id,

            moodId:
                cleanOptional(
                    input.moodId
                ) ??
                resolveMoodTag(profileSet.moods),

            colorFilter:
                cleanOptional(
                    input.colorFilter
                ) ??
                resolveColorTag(profileSet.colors),
        };
    }

    const context =
        buildContext(
            input
        );

    switch (
        input.target
    ) {
        case "username": {
            const result =
                await generateJson(
                    `
You are generating one replacement Discord username for an existing Aesthetic King profile.

${context}

Generate a NEW username that fits the same concept but is meaningfully different from the current username.

Return ONLY:

{
  "usernameIdea": "string"
}

Rules:
- 32 characters or fewer.
- Usable as a Discord username concept.
- No explanation.
                    `.trim()
                );

            if (
                typeof result.usernameIdea !==
                "string" ||
                !result.usernameIdea.trim()
            ) {
                throw new ExpectedError(
                    "Ollama did not return a valid username."
                );
            }

            return {
                usernameIdea:
                    result.usernameIdea
                        .trim()
                        .slice(
                            0,
                            32
                        ),
            };
        }

        case "bio": {
            const result =
                await generateJson(
                    `
You are generating one replacement Discord bio for an existing Aesthetic King profile.

${context}

Generate a NEW bio while preserving the rest of the profile concept.

Return ONLY:

{
  "bio": "string"
}

Rules:
- 190 characters or fewer.
- Do not repeat the existing bio.
- No explanation.
                    `.trim()
                );

            if (
                typeof result.bio !==
                "string" ||
                !result.bio.trim()
            ) {
                throw new ExpectedError(
                    "Ollama did not return a valid bio."
                );
            }

            return {
                bio:
                    result.bio
                        .trim()
                        .slice(
                            0,
                            190
                        ),
            };
        }

        case "status": {
            const result =
                await generateJson(
                    `
You are generating one replacement Discord status for an existing Aesthetic King profile.

${context}

Generate a NEW status that fits the same aesthetic.

Return ONLY:

{
  "status": "string"
}

Rules:
- 128 characters or fewer.
- Do not repeat the existing status.
- No explanation.
                    `.trim()
                );

            if (
                typeof result.status !==
                "string" ||
                !result.status.trim()
            ) {
                throw new ExpectedError(
                    "Ollama did not return a valid status."
                );
            }

            return {
                status:
                    result.status
                        .trim()
                        .slice(
                            0,
                            128
                        ),
            };
        }

        case "palette": {
            const result =
                await generateJson(
                    `
You are generating a replacement color palette for an existing Aesthetic King profile.

${context}

Generate a NEW cohesive palette.

Return ONLY:

{
  "palette": [
    "#000000",
    "#000000",
    "#000000"
  ]
}

Rules:
- 3 to 6 colors.
- Every color must be a six-digit hexadecimal value.
- The palette should be meaningfully different from the current palette.
- No explanation.
                    `.trim()
                );

            const palette =
                Array.isArray(
                    result.palette
                )
                    ? result.palette
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
                                  value !==
                                  null
                          )
                          .slice(
                              0,
                              6
                          )
                    : [];

            if (
                palette.length <
                3
            ) {
                throw new ExpectedError(
                    "Ollama did not return a valid palette."
                );
            }

            return {
                palette,
            };
        }

        case "symbols": {
            const result =
                await generateJson(
                    `
You are generating replacement decorative symbols for an existing Aesthetic King profile.

${context}

Generate a NEW group of decorative Unicode symbols.

Return ONLY:

{
  "symbols": [
    "symbol",
    "symbol",
    "symbol"
  ]
}

Rules:
- Return 3 to 6 symbols.
- Decorative Unicode only.
- Keep them cohesive with the aesthetic.
- No explanation.
                    `.trim()
                );

            const symbols =
                Array.isArray(
                    result.symbols
                )
                    ? result.symbols
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
                          .filter(
                              Boolean
                          )
                          .slice(
                              0,
                              6
                          )
                    : [];

            if (
                symbols.length <
                3
            ) {
                throw new ExpectedError(
                    "Ollama did not return valid symbols."
                );
            }

            return {
                symbols,
            };
        }
    }
}