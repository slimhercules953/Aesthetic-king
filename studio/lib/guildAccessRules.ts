import {
    ExpectedError,
} from "./apiError";

import {
    query,
    withTransaction,
} from "./database";

/**
 * Server access rules, Studio side.
 *
 * The bot enforces these (`src/services/database/guildAccessService.js`);
 * this module only reads and writes them. The precedence rules live there —
 * keep the two in step if either changes.
 */
export type AccessRuleKind =
    | "ROLE"
    | "CHANNEL";

export type AccessRuleEffect =
    | "ALLOW"
    | "DENY";

export type AccessRule = {
    id: string;
    kind: AccessRuleKind;
    effect: AccessRuleEffect;
    targetId: string;
};

type AccessRuleRow = {
    id: string;
    kind: string;
    effect: string;
    targetId: string;
};

const KINDS = new Set<string>([
    "ROLE",
    "CHANNEL",
]);

const EFFECTS = new Set<string>([
    "ALLOW",
    "DENY",
]);

export async function getAccessRules(
    discordGuildId: string
): Promise<AccessRule[]> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const result =
        await query<AccessRuleRow>(
            `
                SELECT
                    r.id,
                    r.kind,
                    r.effect,
                    r."targetId"
                FROM "GuildAccessRule" r
                INNER JOIN "Guild" g
                    ON g.id = r."guildId"
                WHERE g."discordId" = $1
                ORDER BY
                    CASE r.effect
                        WHEN 'DENY' THEN 0
                        ELSE 1
                    END ASC,
                    r."createdAt" ASC
            `,
            [discordGuildId]
        );

    return result.rows
        .filter(
            (row) =>
                KINDS.has(row.kind) &&
                EFFECTS.has(row.effect)
        )
        .map((row) => ({
            id: row.id,
            kind: row.kind as AccessRuleKind,
            effect: row.effect as AccessRuleEffect,
            targetId: row.targetId,
        }));
}

/**
 * Discord snowflakes are decimal strings up to 20 digits. Anything else is a
 * hand-edited request, and storing it would create a rule that can never
 * match — which, under deny-beats-allow, silently does nothing at best.
 */
function normalizeTargetId(
    value: unknown
): string {
    if (typeof value !== "string") {
        throw new ExpectedError(
            "Access rule target is required."
        );
    }

    const trimmed = value.trim();

    if (!/^\d{5,25}$/.test(trimmed)) {
        throw new ExpectedError(
            "Access rule target must be a role or channel ID."
        );
    }

    return trimmed;
}

/**
 * Adds a rule. The unique index on (guildId, kind, targetId) makes a repeat
 * add a no-op rather than a duplicate row, so a double-clicked button cannot
 * pile up identical rules.
 */
export async function addAccessRule(
    discordGuildId: string,
    input: {
        kind?: unknown;
        effect?: unknown;
        targetId?: unknown;
    }
): Promise<AccessRule> {
    const kind = String(input.kind ?? "")
        .trim()
        .toUpperCase();

    const effect = String(input.effect ?? "ALLOW")
        .trim()
        .toUpperCase();

    if (!KINDS.has(kind)) {
        throw new ExpectedError(
            "Access rule kind must be ROLE or CHANNEL."
        );
    }

    if (!EFFECTS.has(effect)) {
        throw new ExpectedError(
            "Access rule effect must be ALLOW or DENY."
        );
    }

    const targetId = normalizeTargetId(
        input.targetId
    );

    const result =
        await query<AccessRuleRow>(
            `
                INSERT INTO "GuildAccessRule" (
                    id,
                    "guildId",
                    kind,
                    effect,
                    "targetId",
                    "createdAt",
                    "updatedAt"
                )
                SELECT
                    gen_random_uuid()::text,
                    g.id,
                    $2,
                    $3,
                    $4,
                    NOW(),
                    NOW()
                FROM "Guild" g
                WHERE g."discordId" = $1
                ON CONFLICT ("guildId", "kind", "targetId")
                DO UPDATE SET
                    effect = EXCLUDED.effect,
                    "updatedAt" = NOW()
                RETURNING
                    id,
                    kind,
                    effect,
                    "targetId"
            `,
            [
                discordGuildId,
                kind,
                effect,
                targetId,
            ]
        );

    const row = result.rows[0];

    if (!row) {
        throw new ExpectedError(
            "Aesthetic King is not installed in this Discord server."
        );
    }

    return {
        id: row.id,
        kind: row.kind as AccessRuleKind,
        effect: row.effect as AccessRuleEffect,
        targetId: row.targetId,
    };
}

/**
 * Removes a rule by target rather than by row id.
 *
 * The UI identifies a rule by what it points at ("the Moderator role"), which
 * is also how an owner thinks about it, and it means removing a rule does not
 * require the client to have seen the row id.
 */
export async function removeAccessRule(
    discordGuildId: string,
    input: {
        kind: unknown;
        targetId: unknown;
    }
): Promise<boolean> {
    const kind = String(input.kind ?? "")
        .trim()
        .toUpperCase();

    if (!KINDS.has(kind)) {
        throw new ExpectedError(
            "Access rule kind must be ROLE or CHANNEL."
        );
    }

    const targetId = normalizeTargetId(
        input.targetId
    );

    const result =
        await query<{ id: string }>(
            `
                DELETE FROM "GuildAccessRule" r
                USING "Guild" g
                WHERE g.id = r."guildId"
                    AND g."discordId" = $1
                    AND r.kind = $2
                    AND r."targetId" = $3
                RETURNING r.id
            `,
            [discordGuildId, kind, targetId]
        );

    return result.rowCount
        ? result.rowCount > 0
        : false;
}

/**
 * Replaces the whole rule set in one statement.
 *
 * Used when the owner saves the tab after several edits. Deleting then
 * re-inserting inside a single statement keeps the operation atomic — a
 * partial failure can never leave the server with half its rules gone, which
 * for a deny rule would mean silently opening the bot back up.
 */
export async function replaceAccessRules(
    discordGuildId: string,
    rules: unknown
): Promise<AccessRule[]> {
    if (!Array.isArray(rules)) {
        throw new ExpectedError(
            "Access rules must be a list."
        );
    }

    if (rules.length > 100) {
        throw new ExpectedError(
            "A server can have at most 100 access rules."
        );
    }

    const prepared = (
        rules as Array<{
            kind?: unknown;
            effect?: unknown;
            targetId?: unknown;
        }>
    ).map((rule) => {
        const kind = String(rule.kind ?? "")
            .trim()
            .toUpperCase();

        const effect = String(rule.effect ?? "ALLOW")
            .trim()
            .toUpperCase();

        if (!KINDS.has(kind)) {
            throw new ExpectedError(
                "Access rule kind must be ROLE or CHANNEL."
            );
        }

        if (!EFFECTS.has(effect)) {
            throw new ExpectedError(
                "Access rule effect must be ALLOW or DENY."
            );
        }

        return {
            kind,
            effect,
            targetId: normalizeTargetId(
                rule.targetId
            ),
        };
    });

    const deduped = new Map<
        string,
        (typeof prepared)[number]
    >();

    for (const rule of prepared) {
        deduped.set(
            `${rule.kind}:${rule.targetId}`,
            rule
        );
    }

    const rows = Array.from(deduped.values());

    /*
     * Delete-then-insert must be one transaction. Outside a transaction a
     * failure between the two statements leaves the server with no rules at
     * all, which under "no rules means open" silently un-restricts a guild
     * that the owner believes is restricted.
     */
    return withTransaction(async (client) => {
        const guild = await client.query<{ id: string }>(
            `
                SELECT id
                FROM "Guild"
                WHERE "discordId" = $1
                LIMIT 1
            `,
            [discordGuildId]
        );

        const guildRow = guild.rows[0];

        if (!guildRow) {
            throw new ExpectedError(
                "Aesthetic King is not installed in this Discord server."
            );
        }

        await client.query(
            `
                DELETE FROM "GuildAccessRule"
                WHERE "guildId" = $1
            `,
            [guildRow.id]
        );

        if (rows.length === 0) {
            return [];
        }

        const values: string[] = [];
        const params: unknown[] = [guildRow.id];

        rows.forEach((rule, index) => {
            const base = index * 3;

            values.push(
                `(
                    gen_random_uuid()::text,
                    $1,
                    $${base + 2},
                    $${base + 3},
                    $${base + 4},
                    NOW(),
                    NOW()
                )`
            );

            params.push(
                rule.kind,
                rule.effect,
                rule.targetId
            );
        });

        const inserted =
            await client.query<AccessRuleRow>(
                `
                INSERT INTO "GuildAccessRule" (
                    id,
                    "guildId",
                    kind,
                    effect,
                    "targetId",
                    "createdAt",
                    "updatedAt"
                )
                VALUES
                    ${values.join(", ")}
                RETURNING
                    id,
                    kind,
                    effect,
                    "targetId"
            `,
                params
            );

        return inserted.rows.map((row) => ({
            id: row.id,
            kind: row.kind as AccessRuleKind,
            effect: row.effect as AccessRuleEffect,
            targetId: row.targetId,
        }));
    });
}
