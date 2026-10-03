import {
    ExpectedError,
} from "./apiError";

import {
    query,
} from "./database";

/**
 * Read-side aggregation for the Analytics tab.
 *
 * Everything here is a plain `GROUP BY` over `GuildUsageEvent`. There is no
 * rollup table because the volume does not justify one yet: a row is written
 * per command, the two indexes cover every query below (`guildId, createdAt`
 * and `guildId, commandName`), and a rollup would need invalidating every
 * time an owner wanted a different date range.
 */

export type AnalyticsRange =
    | 7
    | 14
    | 30
    | 90;

const ALLOWED_RANGES: number[] = [
    7,
    14,
    30,
    90,
];

export function normaliseRange(
    value: unknown
): AnalyticsRange {
    const days = Number(value);

    if (
        !Number.isFinite(days) ||
        !ALLOWED_RANGES.includes(days)
    ) {
        return 30;
    }

    return days as AnalyticsRange;
}

export type UsageSummary = {
    totalEvents: number;
    uniqueMembers: number;
    premiumEvents: number;
    buttonEvents: number;
    busiestDay: {
        date: string | null;
        count: number;
    };
    firstEventAt: Date | null;
};

export type DailyPoint = {
    date: string;
    count: number;
};

export type CommandBreakdown = {
    commandName: string;
    count: number;
    uniqueMembers: number;
};

export type MemberBreakdown = {
    discordUserId: string;
    count: number;
    lastUsedAt: Date;
};

export type PackBreakdown = {
    packId: string;
    count: number;
};

export type GuildAnalytics = {
    range: AnalyticsRange;
    summary: UsageSummary;
    daily: DailyPoint[];
    commands: CommandBreakdown[];
    members: MemberBreakdown[];
    packs: PackBreakdown[];
};

const NO_SUMMARY: UsageSummary = {
    totalEvents: 0,
    uniqueMembers: 0,
    premiumEvents: 0,
    buttonEvents: 0,
    busiestDay: { date: null, count: 0 },
    firstEventAt: null,
};

/**
 * Guild id resolution is inlined into each query rather than fetched first.
 * `GuildUsageEvent.guildId` has no foreign key (deliberately — see the bot's
 * `guildAnalyticsService`), so a join through `Guild` is also what makes an
 * uninstalled guild's analytics unreachable from Studio.
 */
const GUILD_JOIN = `
    INNER JOIN "Guild" g
        ON g.id = e."guildId"
`;

export async function getGuildAnalytics(
    discordGuildId: string,
    days: AnalyticsRange = 30
): Promise<GuildAnalytics> {
    if (!discordGuildId) {
        throw new ExpectedError(
            "A Discord guild ID is required."
        );
    }

    const window = [
        discordGuildId,
        `${days} days`,
    ];

    const [
        summaryResult,
        dailyResult,
        commandResult,
        memberResult,
        packResult,
    ] = await Promise.all([
        query<{
            totalEvents: string;
            uniqueMembers: string;
            premiumEvents: string;
            buttonEvents: string;
            busiestDate: string | null;
            busiestCount: string;
            firstEventAt: Date | null;
        }>(
            `
                WITH scoped AS (
                    SELECT
                        e."createdAt",
                        e."discordUserId",
                        e."premium",
                        e."component"
                    FROM "GuildUsageEvent" e
                    ${GUILD_JOIN}
                    WHERE g."discordId" = $1
                        AND e."createdAt" >=
                            NOW() - $2::interval
                ),
                by_day AS (
                    SELECT
                        to_char(
                            date_trunc('day', "createdAt"),
                            'YYYY-MM-DD'
                        ) AS day,
                        COUNT(*)::text AS count
                    FROM scoped
                    GROUP BY 1
                    ORDER BY COUNT(*) DESC
                    LIMIT 1
                )
                SELECT
                    (SELECT COUNT(*)::text FROM scoped)
                        AS "totalEvents",
                    (
                        SELECT COUNT(
                            DISTINCT "discordUserId"
                        )::text
                        FROM scoped
                    ) AS "uniqueMembers",
                    (
                        SELECT COUNT(*)::text
                        FROM scoped
                        WHERE "premium"
                    ) AS "premiumEvents",
                    (
                        SELECT COUNT(*)::text
                        FROM scoped
                        WHERE "component" = 'button'
                    ) AS "buttonEvents",
                    (SELECT day FROM by_day)
                        AS "busiestDate",
                    (
                        SELECT COALESCE(
                            count,
                            '0'
                        )
                        FROM by_day
                        LIMIT 1
                    ) AS "busiestCount",
                    (
                        SELECT MIN(e."createdAt")
                        FROM "GuildUsageEvent" e
                        ${GUILD_JOIN}
                        WHERE g."discordId" = $1
                    ) AS "firstEventAt"
            `,
            window
        ),

        /*
         * generate_series rather than GROUP BY on the events: a gap in the
         * data has to render as a gap in the chart, otherwise a weekend with
         * no activity looks like a dip in a continuous line and the whole
         * shape of the week reads wrong.
         */
        query<DailyPoint>(
            `
                SELECT
                    to_char(day, 'YYYY-MM-DD') AS date,
                    COALESCE(
                        COUNT(e.id)::int,
                        0
                    ) AS count
                FROM generate_series(
                    date_trunc('day', NOW()) - ($2::interval - '1 day')::interval,
                    date_trunc('day', NOW()),
                    '1 day'
                ) AS day
                LEFT JOIN "GuildUsageEvent" e
                    ON date_trunc('day', e."createdAt") = day
                    AND e."guildId" = (
                        SELECT id
                        FROM "Guild"
                        WHERE "discordId" = $1
                    )
                GROUP BY day
                ORDER BY day ASC
            `,
            window
        ),

        query<CommandBreakdown>(
            `
                SELECT
                    e."commandName",
                    COUNT(*)::int AS count,
                    COUNT(
                        DISTINCT e."discordUserId"
                    )::int AS "uniqueMembers"
                FROM "GuildUsageEvent" e
                ${GUILD_JOIN}
                WHERE g."discordId" = $1
                    AND e."createdAt" >=
                        NOW() - $2::interval
                GROUP BY e."commandName"
                ORDER BY COUNT(*) DESC
                LIMIT 12
            `,
            window
        ),

        query<MemberBreakdown>(
            `
                SELECT
                    e."discordUserId",
                    COUNT(*)::int AS count,
                    MAX(e."createdAt") AS "lastUsedAt"
                FROM "GuildUsageEvent" e
                ${GUILD_JOIN}
                WHERE g."discordId" = $1
                    AND e."createdAt" >=
                        NOW() - $2::interval
                GROUP BY e."discordUserId"
                ORDER BY COUNT(*) DESC
                LIMIT 10
            `,
            window
        ),

        query<PackBreakdown>(
            `
                SELECT
                    e."packId",
                    COUNT(*)::int AS count
                FROM "GuildUsageEvent" e
                ${GUILD_JOIN}
                WHERE g."discordId" = $1
                    AND e."createdAt" >=
                        NOW() - $2::interval
                    AND e."packId" IS NOT NULL
                GROUP BY e."packId"
                ORDER BY COUNT(*) DESC
                LIMIT 8
            `,
            window
        ),
    ]);

    const summaryRow =
        summaryResult.rows[0];

    const summary: UsageSummary = summaryRow
        ? {
            totalEvents:
                Number(summaryRow.totalEvents) || 0,

            uniqueMembers:
                Number(summaryRow.uniqueMembers) || 0,

            premiumEvents:
                Number(summaryRow.premiumEvents) || 0,

            buttonEvents:
                Number(summaryRow.buttonEvents) || 0,

            busiestDay: {
                date: summaryRow.busiestDate ?? null,
                count:
                    Number(summaryRow.busiestCount) || 0,
            },

            firstEventAt:
                summaryRow.firstEventAt ?? null,
        }
        : { ...NO_SUMMARY };

    return {
        range: days,
        summary,

        daily: dailyResult.rows.map((row) => ({
            date: row.date,
            count: Number(row.count) || 0,
        })),

        commands: commandResult.rows.map((row) => ({
            commandName: row.commandName,
            count: Number(row.count) || 0,
            uniqueMembers:
                Number(row.uniqueMembers) || 0,
        })),

        members: memberResult.rows.map((row) => ({
            discordUserId: row.discordUserId,
            count: Number(row.count) || 0,
            lastUsedAt: row.lastUsedAt,
        })),

        packs: packResult.rows.map((row) => ({
            packId: row.packId,
            count: Number(row.count) || 0,
        })),
    };
}
