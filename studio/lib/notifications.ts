import {
    query,
} from "./database";

/**
 * In-app notices shown by the bell in the topbar.
 *
 * Two rules shape this file:
 *
 * 1. Writing a notice must never break the action that caused it. Every
 *    emitter swallows its own failures — a like that fails to record a
 *    notification is still a like.
 * 2. Nothing here is a queue. Notices are rows written inline by the
 *    event source, and time-based ones (Premium expiring) are derived at
 *    read time rather than by a cron we do not have.
 */

export type NotificationType =
    | "LIKE"
    | "PROFILE_UPDATED"
    | "PREMIUM_GRANTED"
    | "PREMIUM_REVOKED"
    | "PREMIUM_EXPIRING"
    | "BOT_UPDATE"
    | "VOTE"
    | "SERVER";

export type NotificationItem = {
    id: string;
    type: NotificationType;
    title: string;
    body: string | null;
    href: string | null;
    icon: string | null;
    readAt: Date | null;
    createdAt: Date;
};

const MAX_LIST = 50;

/** How far ahead the Premium expiry warning reaches. */
export const EXPIRY_WARNING_DAYS = 7;

function normalizeText(
    value: string | null | undefined,
    max: number
): string | null {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return null;
    return trimmed.length > max
        ? `${trimmed.slice(0, max - 1)}…`
        : trimmed;
}

/**
 * Records one notice.
 *
 * `dedupeKey` makes the write idempotent: re-running the same event (a
 * replayed webhook, a double-clicked save) finds the existing row and
 * changes nothing. Callers that genuinely want a notice per event omit it.
 *
 * Returns true when a new row was created.
 */
export async function createNotification(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body?: string | null;
    href?: string | null;
    icon?: string | null;
    dedupeKey?: string | null;
}): Promise<boolean> {
    const title = normalizeText(input.title, 140);
    if (!title) return false;

    try {
        const result =
            await query<{ id: string }>(
                `
                INSERT INTO "Notification"
                    ("userId", "type", "title", "body", "href", "icon", "dedupeKey", "createdAt")
                VALUES ($1, $2::"NotificationType", $3, $4, $5, $6, $7, NOW())
                ON CONFLICT ("dedupeKey") DO NOTHING
                RETURNING "id"
                `,
                [
                    input.userId,
                    input.type,
                    title,
                    normalizeText(input.body, 500),
                    normalizeText(input.href, 400),
                    normalizeText(input.icon, 40),
                    normalizeText(input.dedupeKey, 190),
                ]
            );

        return (result.rowCount ?? 0) > 0;
    } catch (error) {
        // A notice is a nicety. Never let it fail the caller.
        console.error(
            "[notifications] create failed",
            error instanceof Error
                ? error.message
                : error
        );
        return false;
    }
}

/**
 * Same as `createNotification` but addressed by Discord ID, which is what
 * most event sources already have in hand.
 */
export async function createNotificationForDiscordUser(
    discordId: string | null | undefined,
    input: Omit<
        Parameters<typeof createNotification>[0],
        "userId"
    >
): Promise<boolean> {
    const id = (discordId ?? "").trim();
    if (!id) return false;

    try {
        const rows =
            await query<{ id: string }>(
                `SELECT id FROM "User" WHERE "discordId" = $1 LIMIT 1`,
                [id]
            );

        const userId = rows.rows[0]?.id;
        if (!userId) return false;

        return await createNotification({
            ...input,
            userId,
        });
    } catch (error) {
        console.error(
            "[notifications] lookup failed",
            error instanceof Error
                ? error.message
                : error
        );
        return false;
    }
}

/**
 * Lists notices, newest first.
 *
 * Two kinds are synthesised here instead of stored: Premium-expiry
 * warnings and published patch notes. There is no scheduler in this
 * deployment, so anything time-based would need something to create it on
 * time; deriving it means it is simply correct whenever the bell is
 * opened. Patch notes already have their own table plus a per-user
 * dismissal table, so copying them into `Notification` would only add a
 * second place for the same fact to go stale.
 */
export async function listNotifications(
    discordId: string
): Promise<NotificationItem[]> {
    const result =
        await query<{
            id: string;
            type: NotificationType;
            title: string;
            body: string | null;
            href: string | null;
            icon: string | null;
            "readAt": Date | null;
            createdAt: Date;
        }>(
            `
            SELECT
                n."id",
                n."type",
                n."title",
                n."body",
                n."href",
                n."icon",
                n."readAt",
                n."createdAt"
            FROM "Notification" n
            INNER JOIN "User" u ON u.id = n."userId"
            WHERE u."discordId" = $1
            ORDER BY n."createdAt" DESC
            LIMIT ${MAX_LIST}
            `,
            [discordId]
        );

    const stored: NotificationItem[] = result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        href: row.href,
        icon: row.icon,
        readAt: row.readAt,
        createdAt: row.createdAt,
    }));

    const [derived, patchNotes] = await Promise.all([
        listExpiryWarnings(discordId),
        listPatchNotes(discordId),
    ]);

    return [...stored, ...derived, ...patchNotes]
        .sort(
            (a, b) =>
                b.createdAt.getTime() - a.createdAt.getTime()
        )
        .slice(0, MAX_LIST);
}

/**
 * Published changelog entries the user has not dismissed.
 *
 * `PatchNotification` was written as a "seen" record, so a row there means
 * the notice is hidden. Marking one read inserts that row.
 */
async function listPatchNotes(
    discordId: string
): Promise<NotificationItem[]> {
    const result =
        await query<{
            id: string;
            version: string;
            title: string;
            body: string;
            publishedAt: Date;
        }>(
            `
            SELECT
                p."id",
                p."version",
                p."title",
                p."body",
                p."publishedAt"
            FROM "PatchNote" p
            WHERE
                p."publishedAt" <= NOW()
                AND NOT EXISTS (
                    SELECT 1
                    FROM "PatchNotification" pn
                    INNER JOIN "User" u ON u.id = pn."userId"
                    WHERE pn."patchId" = p.id AND u."discordId" = $1
                )
            ORDER BY p."publishedAt" DESC
            LIMIT 10
            `,
            [discordId]
        );

    return result.rows.map((row) => ({
        id: `patch:${row.id}`,
        type: "BOT_UPDATE" as NotificationType,
        title: `${row.version} — ${row.title}`,
        body: row.body || null,
        href: "/dashboard",
        icon: "Sparkles",
        readAt: null,
        createdAt: new Date(row.publishedAt),
    }));
}

/**
 * A single "Premium ends soon" notice, present only while the account is
 * inside the warning window. It is read-only, so its id is synthetic and
 * marking it read is a no-op on the server.
 */
async function listExpiryWarnings(
    discordId: string
): Promise<NotificationItem[]> {
    const result =
        await query<{ endsAt: Date }>(
            `
            SELECT e."endsAt"
            FROM "Entitlement" e
            INNER JOIN "User" u ON u.id = e."userId"
            WHERE
                u."discordId" = $1
                AND e."active" = true
                AND e."endsAt" IS NOT NULL
                AND e."endsAt" > NOW()
                AND e."endsAt" <= NOW() + ($2 || ' days')::interval
            ORDER BY e."endsAt" ASC
            LIMIT 1
            `,
            [discordId, String(EXPIRY_WARNING_DAYS)]
        );

    const endsAt = result.rows[0]?.endsAt;
    if (!endsAt) return [];

    const days = Math.max(
        1,
        Math.ceil(
            (new Date(endsAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
    );

    return [
        {
            id: `expiry:${new Date(endsAt).toISOString()}`,
            type: "PREMIUM_EXPIRING",
            title:
                days === 1
                    ? "Premium ends tomorrow"
                    : `Premium ends in ${days} days`,
            body:
                "Renew to keep unlimited generations, extra packs and the Premium asset library.",
            href: "/dashboard/premium/billing",
            icon: "Crown",
            readAt: null,
            createdAt: new Date(endsAt),
        },
    ];
}

export async function countUnread(
    discordId: string
): Promise<number> {
    const [stored, patchNotes] = await Promise.all([
        query<{ count: string | number }>(
            `
            SELECT COUNT(*)::int AS count
            FROM "Notification" n
            INNER JOIN "User" u ON u.id = n."userId"
            WHERE u."discordId" = $1 AND n."readAt" IS NULL
            `,
            [discordId]
        ),
        listPatchNotes(discordId),
    ]);

    return (
        Number(stored.rows[0]?.count ?? 0) +
        patchNotes.length
    );
}

/**
 * Marks one notice read.
 *
 * Synthetic ids carry a prefix so the right backing table can be written:
 * `patch:` dismissals go to `PatchNotification`, and the expiry warning is
 * deliberately un-dismissable — it is a fact about the account, not a
 * message, and hiding it would hide the renewal date.
 */
export async function markNotificationRead(
    id: string,
    discordId: string
): Promise<boolean> {
    if (id.startsWith("patch:")) {
        return dismissPatchNote(
            id.slice("patch:".length),
            discordId
        );
    }

    if (id.includes(":")) return true;

    const result =
        await query(
            `
            UPDATE "Notification" n
            SET "readAt" = NOW()
            FROM "User" u
            WHERE
                n."userId" = u.id
                AND u."discordId" = $2
                AND n.id = $1
                AND n."readAt" IS NULL
            `,
            [id, discordId]
        );

    return (result.rowCount ?? 0) > 0;
}

async function dismissPatchNote(
    patchId: string,
    discordId: string
): Promise<boolean> {
    await query(
        `
        INSERT INTO "PatchNotification" ("userId", "patchId", "notifiedAt")
        SELECT u.id, $2, NOW()
        FROM "User" u
        WHERE u."discordId" = $1
        ON CONFLICT ("userId", "patchId") DO NOTHING
        `,
        [discordId, patchId]
    );

    return true;
}

export async function markAllNotificationsRead(
    discordId: string
): Promise<number> {
    const [stored, notes] = await Promise.all([
        query(
            `
            UPDATE "Notification" n
            SET "readAt" = NOW()
            FROM "User" u
            WHERE n."userId" = u.id AND u."discordId" = $1 AND n."readAt" IS NULL
            `,
            [discordId]
        ),
        query(
            `
            INSERT INTO "PatchNotification" ("userId", "patchId", "notifiedAt")
            SELECT u.id, p.id, NOW()
            FROM "User" u
            CROSS JOIN "PatchNote" p
            WHERE u."discordId" = $1
            ON CONFLICT ("userId", "patchId") DO NOTHING
            `,
            [discordId]
        ),
    ]);

    return (stored.rowCount ?? 0) + (notes.rowCount ?? 0);
}

export async function deleteNotification(
    id: string,
    discordId: string
): Promise<boolean> {
    if (id.startsWith("patch:")) {
        return dismissPatchNote(
            id.slice("patch:".length),
            discordId
        );
    }

    if (id.includes(":")) return true;

    const result =
        await query(
            `
            DELETE FROM "Notification" n
            USING "User" u
            WHERE n."userId" = u.id AND u."discordId" = $2 AND n.id = $1
            `,
            [id, discordId]
        );

    return (result.rowCount ?? 0) > 0;
}
