import {
    ExpectedError,
} from "./apiError";

import {
    query,
    withTransaction,
} from "./database";

import {
    clampText,
    FREE_PROFILE_VERSIONS,
    normalizeDiscriminator,
    normalizeHex,
    normalizePalette,
    normalizeSymbols,
    parseProfileInput,
    PROFILE_LIMITS,
    type ProfileDraft,
} from "./profileModel";

export type Profile = ProfileDraft & {
    id: string;
    isActive: boolean;

    createdAt: Date;
    updatedAt: Date;
};

/**
 * Every column, qualified.
 *
 * Each statement below joins "User" to resolve a discordId into a
 * userId, and both tables have `id`, `createdAt` and `updatedAt`. An
 * unqualified name in that shape is ambiguous and fails at parse time,
 * so the list is written out in full and reused.
 */
const PROFILE_COLUMNS = `
    p.id,
    p.name,
    p."isActive",
    p."profileSetId",
    p.username,
    p.discriminator,
    p.pronouns,
    p.bio,
    p.status,
    p.symbols,
    p.palette,
    p."accentColor",
    p."createdAt",
    p."updatedAt"
`;

export async function getProfilesByDiscordId(
    discordId: string
): Promise<Profile[]> {
    const result =
        await query<Profile>(
            `
            SELECT ${PROFILE_COLUMNS}
            FROM "Profile" p
            INNER JOIN "User" u
                ON u.id = p."userId"
            WHERE
                u."discordId" = $1
            ORDER BY
                p."isActive" DESC,
                p."updatedAt" DESC
            `,
            [
                discordId,
            ]
        );

    return result.rows;
}

export async function getProfileByIdForDiscordUser(
    id: string,
    discordId: string
): Promise<Profile | null> {
    const result =
        await query<Profile>(
            `
            SELECT ${PROFILE_COLUMNS}
            FROM "Profile" p
            INNER JOIN "User" u
                ON u.id = p."userId"
            WHERE
                p.id = $1
                AND u."discordId" = $2
            LIMIT 1
            `,
            [
                id,
                discordId,
            ]
        );

    return result.rows[0] ?? null;
}

/**
 * The profile the Builder opens with.
 *
 * Falls back to the most recently touched profile rather than nothing,
 * so a user who has never pressed "Make active" still resumes their
 * work instead of facing an empty form.
 */
export async function getActiveProfileForDiscordUser(
    discordId: string
): Promise<Profile | null> {
    const result =
        await query<Profile>(
            `
            SELECT ${PROFILE_COLUMNS}
            FROM "Profile" p
            INNER JOIN "User" u
                ON u.id = p."userId"
            WHERE
                u."discordId" = $1
            ORDER BY
                p."isActive" DESC,
                p."updatedAt" DESC
            LIMIT 1
            `,
            [
                discordId,
            ]
        );

    return result.rows[0] ?? null;
}

export async function countProfilesForDiscordUser(
    discordId: string
): Promise<number> {
    const result =
        await query<{ count: string }>(
            `
            SELECT COUNT(*)::text AS count
            FROM "Profile" p
            INNER JOIN "User" u
                ON u.id = p."userId"
            WHERE
                u."discordId" = $1
            `,
            [
                discordId,
            ]
        );

    return Number(result.rows[0]?.count ?? 0);
}

/**
 * Inserts a profile, normalizing the input first.
 *
 * `makeActive` clears the flag on the user's other rows inside the same
 * transaction. Doing it as two statements would let a concurrent
 * request leave two active profiles, and "which one is mine" is exactly
 * the question the flag exists to answer.
 */
export async function createProfileForDiscordUser(
    discordId: string,
    input: unknown,
    options: {
        makeActive?: boolean;
    } = {}
): Promise<Profile> {
    const parsed = parseProfileInput(input);

    if (!parsed.ok) {
        throw new ExpectedError(
            parsed.errors[0] ??
            "This profile could not be saved."
        );
    }

    const draft = parsed.value;

    const makeActive =
        options.makeActive !== false;

    return withTransaction(async (client) => {
        const userResult =
            await client.query<{ id: string }>(
                `
                SELECT u.id
                FROM "User" u
                WHERE u."discordId" = $1
                LIMIT 1
                `,
                [
                    discordId,
                ]
            );

        const user = userResult.rows[0];

        if (!user) {
            throw new ExpectedError(
                "Unable to save profile."
            );
        }

        if (makeActive) {
            await client.query(
                `
                UPDATE "Profile"
                SET
                    "isActive" = false,
                    "updatedAt" = NOW()
                WHERE
                    "userId" = $1
                    AND "isActive" = true
                `,
                [
                    user.id,
                ]
            );
        }

        const result =
            await client.query<Profile>(
                `
                /*
                 * "Profile" AS p because the RETURNING list is the shared
                 * PROFILE_COLUMNS, which is qualified for the SELECTs'
                 * join. Without an alias on the INSERT target, Postgres
                 * has no "p" to resolve and the insert fails outright.
                 */
                INSERT INTO "Profile" AS p (
                    id,
                    "userId",
                    name,
                    "isActive",
                    "profileSetId",
                    username,
                    discriminator,
                    pronouns,
                    bio,
                    status,
                    symbols,
                    palette,
                    "accentColor",
                    "createdAt",
                    "updatedAt"
                )
                VALUES (
                    gen_random_uuid()::text,
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                    NOW(),
                    NOW()
                )
                RETURNING ${PROFILE_COLUMNS}
                `,
                [
                    user.id,
                    draft.name,
                    makeActive,
                    draft.profileSetId,
                    draft.username,
                    draft.discriminator,
                    draft.pronouns,
                    draft.bio,
                    draft.status,
                    draft.symbols,
                    draft.palette,
                    draft.accentColor,
                ]
            );

        const profile = result.rows[0];

        if (!profile) {
            throw new ExpectedError(
                "Unable to save profile."
            );
        }

        return profile;
    });
}

/**
 * Fields a client may change.
 *
 * Every key is optional and absent means "leave alone", which is what
 * the Builder's autosave wants: a keystroke in the bio must not resend
 * (and therefore cannot blank) the palette.
 */
export type UpdateProfilePatch = Partial<ProfileDraft> & {
    isActive?: boolean;
};

/**
 * Applies a patch.
 *
 * Only the keys actually present are written, and each is passed through
 * the same normalizer the create path uses, so a PATCH cannot smuggle in
 * a value POST would have rejected.
 */
export async function updateProfileForDiscordUser(
    id: string,
    discordId: string,
    patch: UpdateProfilePatch
): Promise<Profile | null> {
    /*
     * Built as parallel arrays rather than interpolated SQL: every value
     * stays a bind parameter, so the only dynamic text in the statement
     * is a column name taken from this file's own table.
     */
    const assignments: string[] = [];
    const values: unknown[] = [];

    const add = (
        column: string,
        value: unknown
    ) => {
        values.push(value);

        assignments.push(
            `${column} = $${values.length}`
        );
    };

    /*
     * Each field goes through the same normalizer the create path uses.
     * `parseProfileInput` is deliberately not reused here: it rejects a
     * draft with no palette and no set, which is a rule about a whole
     * profile. A patch carries one field, so applying it would refuse a
     * rename on a profile that happens to be half-finished.
     */
    if (patch.name !== undefined) {
        add(
            "name",
            clampText(patch.name, PROFILE_LIMITS.name) ??
            "Untitled profile"
        );
    }

    if (patch.profileSetId !== undefined) {
        add(
            "\"profileSetId\"",
            patch.profileSetId?.trim().slice(0, 64) || null
        );
    }

    if (patch.username !== undefined) {
        add(
            "username",
            clampText(
                patch.username,
                PROFILE_LIMITS.username
            )
        );
    }

    if (patch.discriminator !== undefined) {
        add(
            "discriminator",
            normalizeDiscriminator(patch.discriminator)
        );
    }

    if (patch.pronouns !== undefined) {
        add(
            "pronouns",
            clampText(
                patch.pronouns,
                PROFILE_LIMITS.pronouns
            )
        );
    }

    if (patch.bio !== undefined) {
        add(
            "bio",
            clampText(patch.bio, PROFILE_LIMITS.bio)
        );
    }

    if (patch.status !== undefined) {
        add(
            "status",
            clampText(patch.status, PROFILE_LIMITS.status)
        );
    }

    if (patch.symbols !== undefined) {
        add(
            "symbols",
            normalizeSymbols(patch.symbols)
        );
    }

    if (patch.palette !== undefined) {
        add(
            "palette",
            normalizePalette(patch.palette)
        );
    }

    if (patch.accentColor !== undefined) {
        add(
            "\"accentColor\"",
            normalizeHex(patch.accentColor)
        );
    }

    if (patch.isActive !== undefined) {
        add("\"isActive\"", patch.isActive);
    }

    if (assignments.length === 0) {
        return getProfileByIdForDiscordUser(
            id,
            discordId
        );
    }

    values.push(id, discordId);

    const idIndex = values.length - 1;
    const discordIndex = values.length;

    const result =
        await query<Profile>(
            `
            UPDATE "Profile" p
            SET
                ${assignments.join(",\n                ")},
                "updatedAt" = NOW()
            FROM "User" u
            WHERE
                p.id = $${idIndex}
                AND p."userId" = u.id
                AND u."discordId" = $${discordIndex}
            RETURNING ${PROFILE_COLUMNS}
            `,
            values
        );

    return result.rows[0] ?? null;
}

/**
 * Makes one profile the active one.
 *
 * The clear-then-set pair runs in a transaction for the same reason as
 * on create: two active profiles is a broken state, and it is reachable
 * if the two statements can interleave with another request.
 */
export async function setActiveProfileForDiscordUser(
    id: string,
    discordId: string
): Promise<Profile | null> {
    return withTransaction(async (client) => {
        const userResult =
            await client.query<{ id: string }>(
                `
                SELECT u.id
                FROM "User" u
                WHERE u."discordId" = $1
                LIMIT 1
                `,
                [
                    discordId,
                ]
            );

        const user = userResult.rows[0];

        if (!user) {
            return null;
        }

        const target =
            await client.query<{ id: string }>(
                `
                SELECT p.id
                FROM "Profile" p
                WHERE
                    p.id = $1
                    AND p."userId" = $2
                LIMIT 1
                `,
                [
                    id,
                    user.id,
                ]
            );

        if (!target.rows[0]) {
            return null;
        }

        await client.query(
            `
            UPDATE "Profile"
            SET
                "isActive" = false,
                "updatedAt" = NOW()
            WHERE
                "userId" = $1
                AND "isActive" = true
            `,
            [
                user.id,
            ]
        );

        const result =
            await client.query<Profile>(
                `
                UPDATE "Profile" p
                SET
                    "isActive" = true,
                    "updatedAt" = NOW()
                WHERE p.id = $1
                RETURNING ${PROFILE_COLUMNS}
                `,
                [
                    id,
                ]
            );

        return result.rows[0] ?? null;
    });
}

export async function deleteProfileForDiscordUser(
    id: string,
    discordId: string
): Promise<boolean> {
    const result =
        await query(
            `
            DELETE FROM "Profile" p
            USING "User" u
            WHERE
                p.id = $1
                AND p."userId" = u.id
                AND u."discordId" = $2
            RETURNING p.id
            `,
            [
                id,
                discordId,
            ]
        );

    return (
        result.rowCount ?? 0
    ) > 0;
}

/**
 * Whether a user may create another profile.
 *
 * The free tier gets the Builder but not a library: one working profile,
 * which is what ADVANCED_PROFILE_BUILDER ("saved versions") is for. The
 * number lives in `profileModel.ts` so the form and the route refuse at
 * the same count.
 */
export function canCreateMoreProfiles(
    existingCount: number,
    advancedUnlocked: boolean
): boolean {
    return (
        advancedUnlocked ||
        existingCount < FREE_PROFILE_VERSIONS
    );
}
