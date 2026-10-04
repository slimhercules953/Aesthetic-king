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
    pack = null,
}) {
    /*
     * Mirrors statusService: a Pack's curated symbols extend the inspiration
     * list rather than replacing it, because the rules below only permit
     * symbols from this list.
     */
    const packSymbols = Array.isArray(pack?.symbols)
        ? pack.symbols
        : [];

    const symbolInspiration = [
        ...new Set([
            ...packSymbols,
            ...aesthetic.symbols,
        ]),
    ].join(" ");

    const packSection = pack
        ? `

CURATED SERVER PACK: ${pack.name}
${pack.description ? pack.description : "No additional direction provided."}

Follow the pack's direction while staying inside the ${aesthetic.name} aesthetic.`
        : "";

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
${symbolInspiration}

USER REQUEST:
${request || "No additional request provided."}${packSection}

RULES:
- Return only the finished bio.
- Do not explain the bio.
- Do not include commentary before or after it.
- Do not use quotation marks around the entire bio.
- Do not use Markdown code fences.
- Maximum length: ${MAX_BIO_LENGTH} characters.
- Make it appropriate for a Discord profile.
- Strongly follow the selected aesthetic.
- If a curated server pack is provided, follow its direction.
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
    pack = null,
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
        pack,
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