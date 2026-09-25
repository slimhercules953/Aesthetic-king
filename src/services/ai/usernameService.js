const {
    generateText,
} = require("./ollamaProvider");

const {
    getAesthetic,
} = require("../../data/aesthetics");

const {
    getMood,
} = require("../../data/moods");

const USERNAME_COUNT = 8;
const MAX_USERNAME_LENGTH = 24;

function buildUsernamePrompt({
    aesthetic,
    mood = null,
    request = "",
}) {
    const moodDescription =
        mood
            ? `${mood.name}: ${mood.description}`
            : "No specific mood requested.";

    return `
You generate Discord username ideas for Aesthetic King.

Generate exactly ${USERNAME_COUNT} different username ideas.

AESTHETIC:
${aesthetic.name}

AESTHETIC DESCRIPTION:
${aesthetic.description}

STYLE GUIDANCE:
${aesthetic.aiGuidance}

MOOD:
${moodDescription}

USER REQUEST:
${request || "No additional request provided."}

RULES:
- Return exactly ${USERNAME_COUNT} usernames.
- Put one username on each line.
- Do not number the lines.
- Do not use bullet points.
- Do not explain anything.
- Return usernames only.
- Use lowercase letters, numbers, periods, and underscores only.
- Do not use spaces.
- Do not use @.
- Do not use Discord Markdown.
- Do not use emojis.
- Do not use decorative Unicode characters.
- Keep every username at or below ${MAX_USERNAME_LENGTH} characters.
- Make the usernames noticeably different from one another.
- Strongly follow the selected aesthetic.
- If a mood is provided, reflect that mood.
- If a user request is provided, incorporate it naturally when possible.
- Prefer memorable usernames over random strings.
`.trim();
}

function sanitizeUsername(value) {
    if (!value) {
        return "";
    }

    let username = value
        .toLowerCase()
        .trim();

    // Remove common AI formatting.
    username = username
        .replace(
            /^\s*(?:\*\*|__)?\d+[.)](?:\*\*|__)?\s*/,
            ""
        )
        .replace(
            /^\s*[-*•]\s*/,
            ""
        )
        .replace(/^["'`]+|["'`]+$/g, "");

    // Convert spaces/hyphens into underscores.
    username = username
        .replace(/[\s-]+/g, "_");

    // Keep only characters suitable for our Discord
    // username generator.
    username = username.replace(
        /[^a-z0-9._]/g,
        ""
    );

    // Collapse repeated separators.
    username = username
        .replace(/_+/g, "_")
        .replace(/\.+/g, ".");

    // Avoid separator characters at either end.
    username = username
        .replace(/^[._]+|[._]+$/g, "");

    if (
        username.length >
        MAX_USERNAME_LENGTH
    ) {
        username = username.slice(
            0,
            MAX_USERNAME_LENGTH
        );

        username = username.replace(
            /[._]+$/g,
            ""
        );
    }

    return username;
}

function parseUsernames(text) {
    const usernames = text
        .split(/\r?\n/)
        .map(sanitizeUsername)
        .filter(
            (username) =>
                username.length >= 2
        );

    const uniqueUsernames = [
        ...new Set(usernames),
    ];

    if (
        uniqueUsernames.length === 0
    ) {
        throw new Error(
            "Ollama did not return any usable username ideas."
        );
    }

    return uniqueUsernames.slice(
        0,
        USERNAME_COUNT
    );
}

async function generateUsernames({
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
        buildUsernamePrompt({
            aesthetic,
            mood,
            request,
        });

    const generatedText =
        await generateText(prompt);

    return {
        usernames:
            parseUsernames(
                generatedText
            ),

        aesthetic,
        mood,
    };
}

module.exports = {
    generateUsernames,
    USERNAME_COUNT,
    MAX_USERNAME_LENGTH,
};