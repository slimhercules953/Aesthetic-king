import type { AssetCatalogSet } from "./assetCatalog";
import { ExpectedError } from "./apiError";
import {
    getAestheticOption,
    isValidAestheticId,
} from "./aesthetics";
import { getMoodOption } from "./moods";
import { generateOllamaText } from "./ollama";
import {
    catalogColorToHex,
    composeProfileDraft,
    getAestheticDescription,
    type CompletionSeed,
    type ComposedProfile,
} from "./profileComposer";
import {
    PROFILE_LIMITS,
    clampText,
    normalizeHex,
    normalizePalette,
    normalizeSymbols,
    type ProfileDraft,
} from "./profileModel";

/*
 * The server half of "Complete My Profile".
 *
 * `profileComposer.ts` already produces a finished profile from the
 * catalog alone. This module adds the optional Ollama pass on top: the
 * model writes the bio, status and username, and the catalog's answer is
 * kept for everything else.
 *
 * The AI pass is allowed to fail. Ollama is an upstream service behind a
 * Workers binding — it is rate limited, it is occasionally down, and its
 * output is frequently unusable. A user who pressed "Complete My Profile"
 * and got an error page after the catalog had already produced a perfectly
 * good identity would reasonably assume the feature is broken, so every
 * failure in `enrichWithAi` is swallowed and the deterministic draft is
 * returned instead. The one thing that must not happen is a generation
 * failure turning a successful composition into a 500.
 */

const AI_TIMEOUT_MS = 20_000;

export type CompleteProfileInput = {
    seed: CompletionSeed;
    sets: AssetCatalogSet[];
    existing?: Partial<ProfileDraft> | null;
    excludeSetId?: string | null;

    /**
     * Ask Ollama for the text. Callers pass the user's choice; the result
     * degrades to catalog copy when this is true and the model fails.
     */
    useAi?: boolean;
};

export type CompletedProfile = ComposedProfile & {
    /** True when the bio/status/username came from the model. */
    ai: boolean;
};

type AiCopy = {
    username?: string;
    bio?: string;
    status?: string;
};

function clean(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value
        .replace(/\r/g, "")
        .replace(/\s+/g, " ")
        .trim();

    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Strips the wrappers a chat model adds even when told not to use them.
 * Without this a bio arrives as "```json\n{...}\n```" and is stored
 * verbatim, which the user then reads in their own profile.
 */
function extractJson(raw: string): string | null {
    const withoutFences = raw
        .replace(/```(?:json)?/gi, "")
        .replace(/```/g, "")
        .trim();

    const start = withoutFences.indexOf("{");
    const end = withoutFences.lastIndexOf("}");

    if (start === -1 || end <= start) {
        return null;
    }

    return withoutFences.slice(start, end + 1);
}

function buildPrompt(
    composed: ComposedProfile,
    seed: CompletionSeed
): string {
    const set = composed.set;
    const aesthetic = getAestheticOption(
        composed.aestheticId
    );

    const seedDescription =
        seed.kind === "profileSet"
            ? `the profile set #${seed.id}`
            : seed.kind === "aesthetic"
                ? `the ${aesthetic?.name ?? seed.id} aesthetic`
                : seed.kind === "color"
                    ? `the color "${seed.name}"`
                    : `the colors ${seed.colors.join(", ")}`;

    /*
     * The palette the composer actually picked for this profile. Passing the
     * color names gives the model something concrete to write towards, and
     * unlike the set's aesthetic and mood tags it can never contradict the
     * seed — the colors were chosen *because* they suit it.
     */
    const colors = (seed.kind === "color"
        ? [seed.name]
        : seed.kind === "palette"
            ? seed.colors
            : set?.colors ?? []
    )
        .filter(Boolean)
        .slice(0, 6)
        .join(", ");

    const description = getAestheticDescription(
        composed.aestheticId
    );

    return `You are the creative engine for Aesthetic King, a Discord profile application.

Write the text for ONE Discord profile.

AESTHETIC: ${aesthetic?.name ?? composed.aestheticId}${description ? ` — ${description}` : ""}
MOOD: ${getMoodOption(composed.moodId)?.name ?? "unspecified"}
PALETTE: ${colors || "unspecified"}
SEEDED FROM: ${seedDescription}

Everything above describes the same profile. Write copy that a fan of the ${aesthetic?.name ?? composed.aestheticId} aesthetic would recognise as their own — the aesthetic is the identity, the mood is only the tone.

Return ONLY valid JSON with exactly these keys:
- "username": 2-20 characters, lowercase letters, digits and underscores only. No spaces, no periods, no hashtag, no display name.
- "bio": at most 150 characters. First person or fragmentary, in the aesthetic. No emoji, no hashtags, no quotation marks.
- "status": at most 60 characters. A short custom-status fragment. No emoji.

Do not use Markdown. Do not use code fences. Do not explain. Do not invent URLs.`;
}

/**
 * Asks the model for the three text fields.
 *
 * Returns null rather than throwing on any problem — a timeout, a non-JSON
 * reply, a JSON reply with no usable fields. The caller then keeps the
 * catalog's copy, which is already complete and on-brand.
 */
async function generateAiCopy(
    composed: ComposedProfile,
    seed: CompletionSeed
): Promise<AiCopy | null> {
    let raw: string;

    try {
        raw = await Promise.race([
            generateOllamaText(
                buildPrompt(composed, seed),
                { json: true }
            ),

            new Promise<never>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                "Ollama timed out."
                            )
                        ),
                    AI_TIMEOUT_MS
                )
            ),
        ]);
    } catch (error) {
        console.error(
            `Complete My Profile: AI enrichment skipped — ${String(
                (error as Error)?.message ?? error
            )}`
        );

        return null;
    }

    const json = extractJson(raw ?? "");

    if (!json) {
        console.error(
            "Complete My Profile: AI enrichment skipped — reply was not JSON."
        );

        return null;
    }

    let parsed: Record<string, unknown>;

    try {
        parsed = JSON.parse(json) as Record<
            string,
            unknown
        >;
    } catch {
        console.error(
            "Complete My Profile: AI enrichment skipped — malformed JSON."
        );

        return null;
    }

    const username = clean(parsed.username);
    const bio = clean(parsed.bio);
    const status = clean(parsed.status);

    const copy: AiCopy = {};

    /*
     * A username is the one field that has to be machine-shaped: it is
     * pasted into Discord's username box, so a model that returns
     * "Gothic Rose." or "@roses" is worse than no answer. The catalog's
     * slug is kept in that case rather than sanitised into something the
     * user did not ask for.
     *
     * Underscores are allowed because Discord allows them and the model
     * reaches for them constantly ("cupcake_puff"); rejecting them threw
     * away usable answers. They still may not lead, trail, or repeat, which
     * keeps out the handles and tags the model also likes to invent.
     */
    if (
        username &&
        /^[a-z0-9_]{2,32}$/.test(username) &&
        !/^_|_$/.test(username) &&
        !/__/.test(username)
    ) {
        copy.username = username;
    }

    if (bio) {
        copy.bio =
            clampText(bio, PROFILE_LIMITS.bio) ??
            undefined;
    }

    if (status) {
        copy.status =
            clampText(
                status,
                PROFILE_LIMITS.status
            ) ?? undefined;
    }

    if (
        !copy.username &&
        !copy.bio &&
        !copy.status
    ) {
        return null;
    }

    return copy;
}

/**
 * Builds a complete profile from one seed.
 *
 * The composition itself is synchronous and cannot fail except for an
 * `ExpectedError` about the seed or an empty catalog. Only the optional AI
 * pass can fail, and it degrades instead of throwing.
 */
export async function completeProfile(
    input: CompleteProfileInput
): Promise<CompletedProfile> {
    const composed = composeProfileDraft({
        seed: input.seed,
        sets: input.sets,
        existing: input.existing,
        excludeSetId: input.excludeSetId,
    });

    if (!input.useAi) {
        return {
            ...composed,
            ai: false,
        };
    }

    const copy = await generateAiCopy(
        composed,
        input.seed
    );

    if (!copy) {
        return {
            ...composed,
            ai: false,
        };
    }

    const draft: ProfileDraft = {
        ...composed.draft,
    };

    const filled = [...composed.filled];

    /*
     * Same rule as the composer: only replace a field this call actually
     * wrote. If the user typed a bio, the composer left it alone and so
     * does the model.
     */
    const replace = (
        key: "username" | "bio" | "status",
        value: string | undefined
    ): void => {
        if (!value) {
            return;
        }

        if (!filled.includes(key)) {
            return;
        }

        draft[key] = value;
    };

    replace("username", copy.username);
    replace("bio", copy.bio);
    replace("status", copy.status);

    return {
        ...composed,
        draft,
        ai: true,
    };
}

/**
 * Validates the seed from the request body.
 *
 * Kept separate from the composer so the route can answer 400 with a
 * specific sentence, and so a client cannot smuggle an arbitrary object
 * into a pure function's union type.
 */
export function parseCompletionSeed(
    body: unknown
): CompletionSeed {
    if (
        typeof body !== "object" ||
        body === null
    ) {
        throw new ExpectedError(
            "Tell me what to build the profile from."
        );
    }

    const raw = body as Record<string, unknown>;
    const kind = String(raw.kind ?? "")
        .trim()
        .toLowerCase();

    /*
     * Compared in lower case because `kind` is lowercased above. Matching
     * the camelCase member name here would reject every set seed the UI
     * sends — the wire value is "profileSet", the comparison has to be
     * "profileset".
     */
    if (kind === "profileset") {
        const id = String(raw.id ?? "")
            .trim();

        if (!/^\d{1,12}$/.test(id)) {
            throw new ExpectedError(
                "That profile set id is not valid."
            );
        }

        return { kind: "profileSet", id };
    }

    if (kind === "aesthetic") {
        const id = String(raw.id ?? "")
            .trim()
            .toLowerCase();

        if (!isValidAestheticId(id)) {
            throw new ExpectedError(
                "Pick one of the aesthetics in the list."
            );
        }

        return { kind: "aesthetic", id };
    }

    if (kind === "color") {
        const name = String(raw.name ?? "")
            .trim()
            .toLowerCase();

        if (!catalogColorToHex(name)) {
            throw new ExpectedError(
                "Pick one of the colors in the list."
            );
        }

        return { kind: "color", name };
    }

    if (kind === "palette") {
        const colors = normalizePalette(
            raw.colors
        );

        if (colors.length === 0) {
            throw new ExpectedError(
                "That palette has no usable colors."
            );
        }

        return { kind: "palette", colors };
    }

    throw new ExpectedError(
        "I don't know how to complete a profile from that."
    );
}

/**
 * Cleans the draft the Builder sends so a crafted body cannot seed the
 * composer with junk, while keeping everything the user actually wrote.
 */
export function parseExistingDraft(
    body: unknown
): Partial<ProfileDraft> | null {
    if (
        typeof body !== "object" ||
        body === null
    ) {
        return null;
    }

    const raw = body as Record<
        string,
        unknown
    >;

    const existing: Partial<ProfileDraft> = {};

    const text = (
        key: keyof ProfileDraft,
        max: number
    ): void => {
        const value = clean(raw[key]);

        if (value) {
            existing[key] = clampText(
                value,
                max
            ) as never;
        }
    };

    text("name", PROFILE_LIMITS.name);
    text("username", PROFILE_LIMITS.username);
    text("pronouns", PROFILE_LIMITS.pronouns);
    text("bio", PROFILE_LIMITS.bio);
    text("status", PROFILE_LIMITS.status);

    if (Array.isArray(raw.symbols)) {
        const symbols = normalizeSymbols(
            raw.symbols
        );

        if (symbols.length > 0) {
            existing.symbols = symbols;
        }
    }

    if (Array.isArray(raw.palette)) {
        const palette = normalizePalette(
            raw.palette
        );

        if (palette.length > 0) {
            existing.palette = palette;
        }
    }

    const accent = normalizeHex(
        raw.accentColor
    );

    if (accent) {
        existing.accentColor = accent;
    }

    const discriminator = String(
        raw.discriminator ?? ""
    ).trim();

    if (/^\d{1,4}$/.test(discriminator)) {
        existing.discriminator = discriminator;
    }

    return Object.keys(existing).length > 0
        ? existing
        : null;
}
