/*
 * In-process rate limiting for interactions.
 *
 * Every generation command ends in a call to a local or paid AI endpoint, and
 * until now nothing stopped one member from holding "New Bio" down and firing
 * hundreds of requests. Discord's own rate limits do not help: they are
 * per-route and per-bot, so one member spamming can exhaust the bucket for the
 * whole bot and get unrelated commands delayed for everyone.
 *
 * The limiter is deliberately in-memory and per-process. A Redis-backed limiter
 * would be more correct across shards, but the bot runs as a single process
 * (see `src/index.js`) and a cache the bot has to reach over the network adds a
 * dependency that can be down — and a down limiter, like a down entitlement
 * check, fails open. If the bot is ever sharded, revisit this.
 *
 * Buckets are pruned on access rather than on a timer: entries only ever
 * matter while their oldest hit is inside the window, so a sweep would be a
 * second way to do the same cleanup.
 */

/**
 * Windows and ceilings, in seconds and hits.
 *
 * `generation` covers anything that reaches the AI — commands and reroll
 * buttons alike, because a reroll is the same cost as a fresh generation.
 * Keyed by user, not by guild: one member spamming should not lock out their
 * servermates.
 *
 * `command` is the catch-all for everything else, set high enough that no
 * amount of normal use can reach it. It exists to stop a scripted client from
 * turning `/profile` into a flood of embeds in a public channel.
 */
const LIMITS = {
    generation: {
        windowSeconds: 60,
        maxHits: 8,
    },

    command: {
        windowSeconds: 10,
        maxHits: 5,
    },
};

/**
 * Slack on top of the window so a bucket's storage outlives its own data by a
 * little, which keeps the pruning check from having to recompute the boundary.
 */
const SWEEP_GRACE_MS = 60_000;

/**
 * Hard cap on tracked buckets. A bot in many servers is bounded by real
 * traffic, but a hostile client can invent unbounded keys, and the map must not
 * be able to grow the process into an OOM. Oldest-first eviction is fine here:
 * the entries it removes are the ones least likely to be hit again.
 */
const MAX_BUCKETS = 50_000;

/** @type {Map<string, { hits: number, resetAt: number }>} */
const buckets = new Map();

function resolveLimit(scope) {
    const limit = LIMITS[scope];

    if (!limit) {
        throw new Error(
            `Unknown rate limit scope: ${scope}`
        );
    }

    return limit;
}

function buildKey(scope, ids) {
    return [
        scope,
        ids.guildId ?? "-",
        ids.userId ?? "-",
    ].join(":");
}

/**
 * Removes buckets whose window has fully passed.
 *
 * Called from `check` rather than on an interval so an idle bot holds no
 * timers and an active bot prunes as it goes.
 */
function prune(now) {
    for (const [key, bucket] of buckets) {
        if (now - bucket.resetAt > SWEEP_GRACE_MS) {
            buckets.delete(key);
        }
    }
}

/**
 * Records a hit and reports whether the action is allowed.
 *
 * The hit is counted even when the action is denied. That is the point: a
 * limiter that only counts permitted hits lets a caller stay exactly at the
 * ceiling forever instead of cooling off.
 *
 * @param {string} scope  a key of `LIMITS`
 * @param {{ guildId?: string|null, userId?: string|null }} ids
 * @returns {{ allowed: boolean, retryAfterSeconds: number, remaining: number }}
 */
function checkRateLimit(scope, ids = {}) {
    const { windowSeconds, maxHits } =
        resolveLimit(scope);

    const now = Date.now();

    prune(now);

    const key = buildKey(scope, ids);

    const existing = buckets.get(key);

    /*
     * A bucket is reused only while its window is still open; otherwise it is
     * replaced, which is what makes this a fixed window rather than a leaky
     * accumulator that never refills.
     */
    const bucket =
        existing && existing.resetAt > now
            ? existing
            : {
                  hits: 0,
                  resetAt: now + windowSeconds * 1000,
              };

    bucket.hits += 1;

    buckets.set(key, bucket);

    if (buckets.size > MAX_BUCKETS) {
        for (const oldestKey of buckets.keys()) {
            buckets.delete(oldestKey);

            if (buckets.size <= MAX_BUCKETS) {
                break;
            }
        }
    }

    const remaining = Math.max(
        0,
        maxHits - bucket.hits
    );

    if (bucket.hits <= maxHits) {
        return {
            allowed: true,
            remaining,
            retryAfterSeconds: 0,
        };
    }

    return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
            1,
            Math.ceil(
                (bucket.resetAt - now) / 1000
            )
        ),
    };
}

/**
 * Whether an action may run, without recording anything.
 *
 * For checks that must happen before a decision the caller might abandon, e.g.
 * deciding whether to show a cooldown notice on a button.
 */
function peekRateLimit(scope, ids = {}) {
    const { maxHits } = resolveLimit(scope);

    const now = Date.now();

    const bucket = buckets.get(
        buildKey(scope, ids)
    );

    if (!bucket || bucket.resetAt <= now) {
        return {
            allowed: true,
            remaining: maxHits,
            retryAfterSeconds: 0,
        };
    }

    const remaining = Math.max(
        0,
        maxHits - bucket.hits
    );

    return {
        allowed: bucket.hits <= maxHits,
        remaining,
        retryAfterSeconds: remaining > 0
            ? 0
            : Math.max(
                1,
                Math.ceil(
                    (bucket.resetAt - now) / 1000
                )
            ),
    };
}

/**
 * Discord renders `<t:seconds:R>` as "in about 3 minutes" in the viewer's own
 * timezone, which beats making the member do arithmetic on a raw second count.
 */
function formatRetryAfter(retryAfterSeconds) {
    return `<t:${Math.ceil(
        Date.now() / 1000 + retryAfterSeconds
    )}:R>`;
}

/**
 * Test seam: forget every bucket.
 */
function resetRateLimits() {
    buckets.clear();
}

module.exports = {
    LIMITS,
    checkRateLimit,
    peekRateLimit,
    formatRetryAfter,
    resetRateLimits,
};
