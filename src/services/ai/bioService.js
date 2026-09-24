const {
    generateText,
} = require("./ollamaProvider");

const {
    getAesthetic,
} = require("../../data/aesthetics");

const MAX_BIO_LENGTH = 190;

function buildBioPrompt({
    aesthetic,
    request,
}) {
    return `
You are the bio generator for Aesthetic King, a Discord aesthetic and profile customization bot.

Generate exactly ONE aesthetic Discord profile bio.

AESTHETIC:
${aesthetic.name}

DESCRIPTION:
${aesthetic.description}

MOODS:
${aesthetic.moods.join(", ")}

STYLE:
${aesthetic.aiGuidance}

SYMBOL INSPIRATION:
${aesthetic.symbols.join(" ")}

USER REQUEST:
${request || "No additional request provided."}

RULES:
- Return only the finished bio.
- Do not explain the bio.
- Do not include commentary before or after it.
- Do not use quotation marks around the entire bio.
- Do not use Markdown code fences.
- Maximum length: ${MAX_BIO_LENGTH} characters.
- Make it appropriate for a Discord profile.
- Strongly follow the selected aesthetic.
- Decorative Unicode symbols are allowed.
- Do not overload the bio with symbols.
- Make the result feel intentionally written rather than generic.
- Only use decorative symbols from the SYMBOL INSPIRATION list provided above.
- Do not invent additional Unicode symbols.
- Prefer common symbols that render reliably on Discord and standard fonts.
`.trim();
}

function cleanGeneratedBio(text) {
    let bio = text.trim();

    if (
        (bio.startsWith('"') &&
            bio.endsWith('"')) ||
        (bio.startsWith("'") &&
            bio.endsWith("'"))
    ) {
        bio = bio.slice(1, -1).trim();
    }

    if (bio.length > MAX_BIO_LENGTH) {
        bio =
            `${bio
                .slice(
                    0,
                    MAX_BIO_LENGTH - 1
                )
                .trimEnd()}…`;
    }

    return bio;
}

async function generateBio({
    aestheticId,
    request = "",
}) {
    const aesthetic =
        getAesthetic(aestheticId);

    if (!aesthetic) {
        throw new Error(
            `Unknown aesthetic: ${aestheticId}`
        );
    }

    const prompt = buildBioPrompt({
        aesthetic,
        request,
    });

    const generatedText =
        await generateText(prompt);

    return {
        bio: cleanGeneratedBio(
            generatedText
        ),
        aesthetic,
    };
}

module.exports = {
    generateBio,
    MAX_BIO_LENGTH,
};