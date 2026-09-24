const {
    generateText,
} = require("./ollamaProvider");

const {
    getAesthetic,
} = require("../../data/aesthetics");

const {
    getMood,
} = require("../../data/moods");

const STATUS_COUNT = 5;
const MAX_STATUS_LENGTH = 100;

function buildStatusPrompt({
    aesthetic,
    mood = null,
    request = "",
}) {
    const moodDescription =
        mood
            ? `${mood.name}: ${mood.description}`
            : "No specific mood requested.";

    return `
You generate aesthetic Discord custom status ideas for Aesthetic King.

Generate exactly ${STATUS_COUNT} different Discord status ideas.

AESTHETIC:
${aesthetic.name}

AESTHETIC DESCRIPTION:
${aesthetic.description}

STYLE GUIDANCE:
${aesthetic.aiGuidance}

SYMBOL INSPIRATION:
${aesthetic.symbols.join(" ")}

MOOD:
${moodDescription}

USER REQUEST:
${request || "No additional request provided."}

RULES:
- Return exactly ${STATUS_COUNT} statuses.
- Put one status on each line.
- Do not number the lines.
- Do not use bullet points.
- Do not explain anything.
- Keep every status under ${MAX_STATUS_LENGTH} characters.
- Make every status noticeably different.
- Strongly follow the selected aesthetic.
- If a mood is provided, strongly follow that mood.
- If a user request is provided, incorporate it naturally.
- Only use decorative symbols from the SYMBOL INSPIRATION list.
- Do not invent obscure Unicode symbols.
- Do not wrap statuses in quotation marks.
- Return plain text only.
- Never use Discord Markdown formatting.
- Do not use *, **, _, __, ~~, backticks, code blocks, or block quotes.
`.trim();
}

function stripMarkdown(text) {
    return text
        .replace(/```/g, "")
        .replace(/`/g, "")
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/~~/g, "")
        .replace(/\*/g, "")
        .replace(/_/g, "")
        .replace(/^\s*>\s*/g, "")
        .trim();
}

function cleanStatusLine(line) {
    let cleaned = line.trim();

    // Remove Markdown-formatted numbering:
    // **1.** text
    // __1.__ text
    cleaned = cleaned.replace(
        /^\s*(?:\*\*|__)?\d+[.)](?:\*\*|__)?\s*/,
        ""
    );

    // Remove normal bullets / numbering:
    // 1. text
    // 1) text
    // - text
    // * text
    // • text
    cleaned = cleaned.replace(
        /^\s*(?:[-*•]|\d+[.)])\s*/,
        ""
    );

    // Remove wrapping quotation marks.
    cleaned = cleaned.replace(
        /^["']|["']$/g,
        ""
    );

    // Strip Discord Markdown syntax.
    cleaned = stripMarkdown(
        cleaned
    );

    return cleaned.trim();
}

function parseStatuses(text) {
    const statuses = text
        .split(/\r?\n/)
        .map(cleanStatusLine)
        .filter(Boolean)
        .map((status) => {
            if (
                status.length <=
                MAX_STATUS_LENGTH
            ) {
                return status;
            }

            return `${status
                .slice(
                    0,
                    MAX_STATUS_LENGTH - 1
                )
                .trimEnd()}…`;
        });

    const uniqueStatuses = [
        ...new Set(statuses),
    ];

    if (uniqueStatuses.length === 0) {
        throw new Error(
            "Ollama did not return any usable status ideas."
        );
    }

    return uniqueStatuses.slice(
        0,
        STATUS_COUNT
    );
}

async function generateStatuses({
    aestheticId,
    moodId = null,
    request = "",
}) {
    const aesthetic =
        getAesthetic(aestheticId);

    if (!aesthetic) {
        throw new Error(
            `Unknown aesthetic: ${aestheticId}`
        );
    }

    const mood =
        moodId
            ? getMood(moodId)
            : null;

    if (moodId && !mood) {
        throw new Error(
            `Unknown mood: ${moodId}`
        );
    }

    const prompt =
        buildStatusPrompt({
            aesthetic,
            mood,
            request,
        });

    const generatedText =
        await generateText(prompt);

    return {
        statuses:
            parseStatuses(
                generatedText
            ),

        aesthetic,
        mood,
    };
}

module.exports = {
    generateStatuses,
    STATUS_COUNT,
    MAX_STATUS_LENGTH,
};