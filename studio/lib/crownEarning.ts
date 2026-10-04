import {
    query,
    withTransaction,
} from "./database";

import {
    getPeriodKey,
} from "./features";

import type { CrownTransactionRow } from "./crowns";

/*
 * The earning half of the Crowns economy.
 *
 * `crowns.ts` can already write an EARN row; what it deliberately does not
 * know is *when* one is owed. That decision lives here, in one table, so
 * the economy has a single answer to "how do Crowns come into existence" —
 * the same reason `features.ts` owns every price and allowance.
 *
 * Two properties were designed in, because a currency that can be farmed
 * is not a currency:
 *
 * **Every award is idempotent.** Each rule is called with a key naming the
 * exact event that earned it (`publish:<postId>`, `topgg_vote:<voter>`), so
 * a retried request, a double-clicked button or a webhook delivered twice
 * credits once. The unique index on ("userId", "idempotencyKey") does the
 * enforcing; the code below only has to pass a stable key.
 *
 * **Every rule is capped per day, and the caps are derived, not stored.**
 * The daily total for a source is a SUM over today's EARN rows rather than
 * a counter in a second table. A counter would be one more thing that can
 * disagree with the ledger, and the ledger is the thing users are shown.
 * There is also a global cap so that a user cannot reach it by rotating
 * through five sources once each.
 *
 * Awarding never throws. These calls sit *after* a user has already
 * published a post or left a comment; failing the action because the
 * reward could not be written would be a terrible trade. A missed award is
 * invisible, and the ledger explains any discrepancy later.
 */

export type CrownEarnSource =
    /** Published something of their own to the Discover feed. */
    | "publish"

    /** Someone liked a post of theirs. */
    | "like_received"

    /** Someone commented on a post of theirs. */
    | "comment_received"

    /** Opened the Studio on a day they had not opened it yet. */
    | "daily_visit"

    /** Someone voted for the bot on Top.gg. */
    | "topgg_vote";

export type CrownEarnRule = {
    source: CrownEarnSource;

    /** Shown on the Earn page. */
    label: string;

    /** Crowns per qualifying event. */
    amount: number;

    /**
     * Maximum awards from this source per UTC day. `Infinity` is
     * deliberately not offered: an uncapped source is a bug waiting for a
     * script.
     */
    dailyCap: number;
};

/**
 * Change these numbers here and nowhere else.
 *
 * The shape of the economy is the part worth keeping: publishing is the
 * best-paid action because it is the one that makes Discover worth
 * visiting, receiving engagement pays less than creating it so a popular
 * account cannot idle its way to a boost, and a Top.gg vote is worth more
 * than a like because it costs the voter something real.
 *
 * The scale is set by `CROWN_EARN_DAILY_TOTAL_CAP` and by the prices in
 * `features.ts` together — see `CROWN_MONTH_MAX_EARN` below for the rule
 * that ties them together.
 */
export const CROWN_EARN_RULES: Record<
    CrownEarnSource,
    CrownEarnRule
> = {
    publish: {
        source: "publish",
        label: "Publish to Discover",
        amount: 5,
        dailyCap: 3,
    },

    like_received: {
        source: "like_received",
        label: "A post of yours got a like",
        amount: 1,
        dailyCap: 10,
    },

    comment_received: {
        source: "comment_received",
        label: "A post of yours got a comment",
        amount: 2,
        dailyCap: 10,
    },

    daily_visit: {
        source: "daily_visit",
        label: "Daily visit",
        amount: 3,
        dailyCap: 1,
    },

    topgg_vote: {
        source: "topgg_vote",
        label: "Voted for the bot on Top.gg",
        amount: 10,
        dailyCap: 1,
    },
};

export const CROWN_EARN_SOURCES = Object.keys(
    CROWN_EARN_RULES
) as CrownEarnSource[];

/**
 * Ceiling on everything a single account can earn in one UTC day, across
 * all sources. Without it the per-source caps are just an instruction to
 * farm every source instead of one.
 */
export const CROWN_EARN_DAILY_TOTAL_CAP = 25;

/**
 * The most a single account can bank in a month by farming every source
 * up to the daily ceiling on every day of the longest month.
 *
 * This is the number the Crown prices in `features.ts` are measured
 * against. The rule: a month of anything Crowns can buy must cost at
 * least twice this. Crowns are meant to pay for a specific thing you ran
 * out of, not to add up into a free month of Premium — if a dedicated
 * account could earn its way to unlocked access, or bank three months of
 * it while nobody was watching, the economy would be a way of not paying
 * rather than a way of paying.
 *
 * The prices are not in this file, so the check lives in
 * `testCrownEarning.js`: it works out what a month of every
 * Crown-buyable feature costs and refuses anything cheaper than
 * `CROWN_MONTH_MIN_COST`. Changing either side fails that test.
 */
export const CROWN_MONTH_MAX_EARN =
    CROWN_EARN_DAILY_TOTAL_CAP * 31;

/**
 * What a month of Crown-buyable access has to cost, at minimum.
 *
 * Two times the most anybody can farm in a month. The multiplier is the
 * headroom: at 1× a determined user breaks even every month, and at 2×
 * they still have to choose between paying and not having the thing.
 */
export const CROWN_MONTH_MIN_COST =
    CROWN_MONTH_MAX_EARN * 2;

export type AwardResult =
    | {
        awarded: true;
        amount: number;
        transaction: CrownTransactionRow;
    }
    | {
        awarded: false;
        reason: "duplicate" | "source_cap" | "daily_cap";
    };

function isCrownEarnSource(
    value: string
): value is CrownEarnSource {
    return Object.prototype.hasOwnProperty.call(
        CROWN_EARN_RULES,
        value
    );
}

/**
 * Writes one EARN row if the event qualifies.
 *
 * `idempotencyKey` is required rather than optional. Every call site in
 * this app is a retried HTTP request or a webhook that may be delivered
 * twice, so a rule that can be triggered repeatedly is not considered
 * correct — if you find yourself wanting to omit the key, the event you
 * are awarding for is probably not a real event.
 */
export async function awardCrowns(
    discordId: string,
    input: {
        source: CrownEarnSource;
        idempotencyKey: string;

        /** Overrides the rule's amount, e.g. for a promotion. */
        amount?: number;
    }
): Promise<AwardResult> {
    const rule = CROWN_EARN_RULES[input.source];

    const amount = input.amount ?? rule.amount;

    if (
        !Number.isInteger(amount) ||
        amount <= 0
    ) {
        return {
            awarded: false,
            reason: "source_cap",
        };
    }

    const key = String(
        input.idempotencyKey ?? ""
    ).trim();

    if (!key) {
        return {
            awarded: false,
            reason: "duplicate",
        };
    }

    const day = getPeriodKey("daily");

    try {
        /*
         * Fast path. Most awards are duplicates — the daily visit fires on
         * every page load — and taking the user's row lock to discover
         * that would serialise normal browsing behind the ledger. This
         * read hits the unique index and answers the common case without
         * one. It is only an optimisation: the authoritative check is
         * inside the transaction below.
         */
        const already =
            await query<{ id: string }>(
                `
                SELECT ct.id
                FROM "CrownTransaction" ct
                INNER JOIN "User" u
                    ON u.id = ct."userId"
                WHERE
                    u."discordId" = $1
                    AND ct."idempotencyKey" = $2
                LIMIT 1
                `,
                [
                    discordId,
                    key,
                ]
            );

        if (already.rowCount) {
            return {
                awarded: false,
                reason: "duplicate",
            };
        }

        return await withTransaction(
            async (client) => {
                const user =
                    await client.query<{
                        id: string;
                    }>(
                        `
                        SELECT id
                        FROM "User"
                        WHERE "discordId" = $1
                        FOR UPDATE
                        `,
                        [
                            discordId,
                        ]
                    );

                const userId =
                    user.rows[0]?.id;

                if (!userId) {
                    return {
                        awarded: false as const,
                        reason: "duplicate" as const,
                    };
                }

                /*
                 * The lock above is held for the whole award, so the two
                 * counts below cannot race with a concurrent award for the
                 * same user. That is what makes the caps trustworthy
                 * rather than approximate.
                 */
                const taken =
                    await client.query<{ id: string }>(
                        `
                        SELECT id
                        FROM "CrownTransaction"
                        WHERE
                            "userId" = $1
                            AND "idempotencyKey" = $2
                        LIMIT 1
                        `,
                        [
                            userId,
                            key,
                        ]
                    );

                if (taken.rowCount) {
                    return {
                        awarded: false as const,
                        reason: "duplicate" as const,
                    };
                }

                const totals =
                    await client.query<{
                        source_count: string | number;
                        total_amount: string | number;
                    }>(
                        `
                        SELECT
                            COUNT(*) FILTER (
                                WHERE ct.source = $2
                            )::bigint AS source_count,

                            COALESCE(
                                SUM(ct.amount),
                                0
                            )::bigint AS total_amount

                        FROM "CrownTransaction" ct
                        WHERE
                            ct."userId" = $1
                            AND ct.type = 'EARN'
                            AND ct."createdAt" >= $3::timestamptz
                        `,
                        [
                            userId,
                            input.source,
                            `${day}T00:00:00Z`,
                        ]
                    );

                const sourceCount = Number(
                    totals.rows[0]?.source_count ?? 0
                );

                const todayEarned = Number(
                    totals.rows[0]?.total_amount ?? 0
                );

                if (sourceCount >= rule.dailyCap) {
                    return {
                        awarded: false as const,
                        reason: "source_cap" as const,
                    };
                }

                if (
                    todayEarned +
                        amount >
                    CROWN_EARN_DAILY_TOTAL_CAP
                ) {
                    return {
                        awarded: false as const,
                        reason: "daily_cap" as const,
                    };
                }

                const inserted =
                    await client.query<CrownTransactionRow>(
                        `
                        INSERT INTO "CrownTransaction" (
                            id,
                            "userId",
                            type,
                            amount,
                            reason,
                            source,
                            "idempotencyKey",
                            "createdAt"
                        )
                        VALUES (
                            $1,
                            $2,
                            'EARN',
                            $3,
                            $4,
                            $5,
                            $6,
                            NOW()
                        )
                        RETURNING
                            id,
                            type,
                            amount,
                            reason,
                            source,
                            "createdAt"
                        `,
                        [
                            crypto.randomUUID(),
                            userId,
                            amount,
                            rule.label,
                            input.source,
                            key,
                        ]
                    );

                return {
                    awarded: true as const,
                    amount,
                    transaction:
                        inserted.rows[0],
                };
            }
        );
    } catch (error) {
        console.error(
            "Crowns: award failed —",
            input.source,
            String(
                (error as Error)?.message ?? error
            )
        );

        return {
            awarded: false,
            reason: "duplicate",
        };
    }
}

/* ------------------------------------------------------------------ */
/* What is still earnable today                                         */
/* ------------------------------------------------------------------ */

/**
 * Whether a source can actually be earned on this deployment right now.
 *
 * Every other source is wired into the product, but a Top.gg vote only
 * arrives if the webhook is configured, and the Studio is not deployed
 * yet. Advertising a source nobody can trigger is worse than saying
 * nothing: the user reads "25 Crowns for voting", votes, and gets
 * nothing. So the Earn page hides it until `TOPGG_WEBHOOK_SECRET`
 * exists, which is exactly the condition the webhook route uses to
 * decide between answering 404 and paying.
 *
 * This hides the offer, not the history — rows already awarded under a
 * source still show in the transaction list and still count toward
 * today's total.
 */
export function isEarnSourceLive(source: CrownEarnSource): boolean {
    if (source === "topgg_vote") {
        return Boolean(process.env.TOPGG_WEBHOOK_SECRET);
    }

    return true;
}

export type EarnSourceStatus = CrownEarnRule & {
    awardedToday: number;

    /** Awards left from this source today. */
    remaining: number;

    /** Crowns still reachable from this source today. */
    crownsRemaining: number;
};

export type EarnStatus = {
    sources: EarnSourceStatus[];

    earnedToday: number;
    dailyCap: number;
    dailyRemaining: number;
};

/**
 * Per-source progress for today, for the Earn page.
 *
 * Reads the ledger rather than any counter, so what the page shows is
 * provably the same thing the balance is made of.
 */
export async function getEarnStatus(
    discordId: string
): Promise<EarnStatus> {
    const day = getPeriodKey("daily");

    const result =
        await query<{
            source: string | null;
            awarded: string | number;
            total: string | number;
        }>(
            `
            SELECT
                ct.source,
                COUNT(*)::bigint AS awarded,
                COALESCE(SUM(ct.amount), 0)::bigint AS total

            FROM "CrownTransaction" ct
            INNER JOIN "User" u
                ON u.id = ct."userId"
            WHERE
                u."discordId" = $1
                AND ct.type = 'EARN'
                AND ct."createdAt" >= $2::timestamptz
            GROUP BY ct.source
            `,
            [
                discordId,
                `${day}T00:00:00Z`,
            ]
        );

    const bySource = new Map<
        string,
        { awarded: number; total: number }
    >();

    let earnedToday = 0;

    for (const row of result.rows) {
        const awarded = Number(row.awarded ?? 0);
        const total = Number(row.total ?? 0);

        earnedToday += total;

        if (row.source && isCrownEarnSource(row.source)) {
            bySource.set(row.source, { awarded, total });
        }
    }

    const sources = CROWN_EARN_SOURCES.filter(
        (source) =>
            isEarnSourceLive(source) ||
            bySource.has(source)
    ).map((source) => {
        const rule = CROWN_EARN_RULES[source];

        const awardedToday =
            bySource.get(source)?.awarded ?? 0;

        const remaining = Math.max(
            0,
            rule.dailyCap - awardedToday
        );

        return {
            ...rule,
            awardedToday,
            remaining,
            crownsRemaining: remaining * rule.amount,
        };
    });

    const dailyRemaining = Math.max(
        0,
        CROWN_EARN_DAILY_TOTAL_CAP - earnedToday
    );

    return {
        sources,
        earnedToday,
        dailyCap: CROWN_EARN_DAILY_TOTAL_CAP,
        dailyRemaining,
    };
}

/* ------------------------------------------------------------------ */
/* The hooks the product actually calls                                 */
/* ------------------------------------------------------------------ */

/**
 * Awards a source without the caller having to build a key or care about
 * the outcome. Used after an action that has already succeeded.
 */
async function award(
    discordId: string,
    source: CrownEarnSource,
    idempotencyKey: string
): Promise<void> {
    await awardCrowns(discordId, {
        source,
        idempotencyKey,
    });
}

/**
 * Publishing pays once per item, ever.
 *
 * The key is the item, not the post row. `shareItemToFeed` upserts on
 * ("userId", "itemType", "itemId"), but deleting the post and re-sharing
 * creates a fresh post id — keying on that would turn unshare/re-share
 * into a way to collect the publish award again every day.
 */
export async function awardForPublish(
    discordId: string,
    itemType: string,
    itemId: string
): Promise<void> {
    if (!itemType || !itemId) {
        return;
    }

    await award(
        discordId,
        "publish",
        `publish:${itemType}:${itemId}`
    );
}

/**
 * Engagement pays the author, never the actor, and never themselves.
 *
 * The self-like check belongs here rather than at the call site: the like
 * route is a toggle, so without it an account could farm its own posts,
 * and every future surface that can like a post would have to remember to
 * repeat the check.
 */
export async function awardForLike(
    authorDiscordId: string,
    likerDiscordId: string,
    postId: string
): Promise<void> {
    if (
        !authorDiscordId ||
        !postId ||
        authorDiscordId === likerDiscordId
    ) {
        return;
    }

    await award(
        authorDiscordId,
        "like_received",
        `like_received:${postId}:${likerDiscordId}`
    );
}

/**
 * A comment pays once per comment, not once per like-style toggle, so the
 * key is the comment id.
 */
export async function awardForComment(
    authorDiscordId: string,
    commenterDiscordId: string,
    commentId: string
): Promise<void> {
    if (
        !authorDiscordId ||
        !commentId ||
        authorDiscordId === commenterDiscordId
    ) {
        return;
    }

    await award(
        authorDiscordId,
        "comment_received",
        `comment_received:${commentId}`
    );
}

/**
 * Once per UTC day. The day is in the key, so the daily cap is enforced by
 * the unique index alone and the count query is only a backstop.
 */
export async function awardForDailyVisit(
    discordId: string
): Promise<void> {
    await award(
        discordId,
        "daily_visit",
        `daily_visit:${getPeriodKey("daily")}`
    );
}

/**
 * A Top.gg vote pays the voter.
 *
 * Top.gg rewards are an incentive to go and do something outside the app,
 * so the person who voted is the person who should be paid. The voter's id
 * is in the key because Top.gg retries webhooks and re-delivers votes, and
 * a 12-hour vote streak from one person is one vote as far as we care.
 */
export async function awardForTopggVote(
    voterDiscordId: string
): Promise<void> {
    if (!voterDiscordId) {
        return;
    }

    await award(
        voterDiscordId,
        "topgg_vote",
        `topgg_vote:${voterDiscordId}:${getPeriodKey(
            "daily"
        )}`
    );
}
