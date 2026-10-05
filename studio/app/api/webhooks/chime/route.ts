import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    constantTimeEquals,
} from "../../../../lib/auth";

import {
    awardForChimeVote,
} from "../../../../lib/crownEarning";

import {
    createNotificationForDiscordUser,
} from "../../../../lib/notifications";

/*
 * Chime vote webhook.
 *
 * Structurally identical to the Top.gg route next to it, and for the same
 * two reasons: the request is authenticated only by a shared secret, so the
 * header has to be verified before anything is paid; and deliveries are
 * retried, so the award has to be idempotent, which `awardForChimeVote`
 * handles with a per-voter per-day key.
 *
 * One deliberate difference. Top.gg's payload shape is documented and fixed,
 * so that route reads `payload.user` directly. Chime's exact field naming is
 * not pinned down here, so `resolveVoterId` accepts the variants a vote
 * webhook plausibly uses and takes the first that looks like a Discord
 * snowflake. That is a narrow, validated set — not a scan of the body — so a
 * malformed or hostile payload still fails closed with a 400 rather than
 * paying somebody on a guess.
 *
 * If Chime's dashboard lets you choose the payload or the header name, set it
 * to match Top.gg: `Authorization: <secret>` and a `user` field holding the
 * Discord id. The extra aliases then never come into play.
 */

function unauthorized(): NextResponse {
    return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
    );
}

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * The voter's Discord id, from whichever field the payload actually uses.
 *
 * Ordered most-likely-first. Values are coerced with `String()` because a
 * list sending the id as a number would otherwise be rejected for a reason
 * the sender cannot see.
 */
function resolveVoterId(payload: {
    [key: string]: unknown;
}): string {
    for (const key of [
        "user",
        "userId",
        "user_id",
        "discordId",
        "discord_id",
    ]) {
        const value = String(payload[key] ?? "").trim();

        if (SNOWFLAKE.test(value)) {
            return value;
        }
    }

    return "";
}

export async function POST(
    request: NextRequest
) {
    const expected = (
        process.env.CHIME_WEBHOOK_SECRET ?? ""
    ).trim();

    // Unconfigured means the endpoint does not exist yet. Answering 404
    // rather than 500 keeps an unprovisioned deploy from looking broken to
    // Chime, which would otherwise keep retrying it.
    if (!expected) {
        return NextResponse.json(
            { error: "Not found" },
            { status: 404 }
        );
    }

    const provided = request.headers.get(
        "Authorization"
    );

    if (
        !provided ||
        !constantTimeEquals(
            provided.trim(),
            expected
        )
    ) {
        return unauthorized();
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 }
        );
    }

    const payload = (body ?? {}) as {
        [key: string]: unknown;
    };

    /*
     * A vote list sends other events to the same URL — a test click when the
     * webhook is saved, a removal when a vote is retracted. Only an actual
     * upvote pays. An absent `type` is treated as a vote, since some lists
     * only ever POST votes; anything that names a non-vote event is ignored.
     */
    const type = payload.type ?? payload.event;

    if (
        typeof type === "string" &&
        !["upvote", "vote", "new", "add"].includes(
            type.toLowerCase()
        )
    ) {
        return NextResponse.json({
            ok: true,
            ignored: true,
        });
    }

    const voter = resolveVoterId(payload);

    if (!voter) {
        return NextResponse.json(
            { error: "Missing or invalid user id." },
            { status: 400 }
        );
    }

    await awardForChimeVote(voter);

    /*
     * Keyed by voter and UTC day so a retried delivery cannot stack
     * identical thank-yous, and worded without mentioning Crowns for the
     * same reason as the Top.gg route: on a deploy without the secret this
     * is the only thing a voter would ever see.
     */
    const voteDay = new Date()
        .toISOString()
        .slice(0, 10);

    await createNotificationForDiscordUser(voter, {
        type: "VOTE",
        title: "Thanks for voting for Aesthetic King on Chime!",
        body: "Your vote helps more servers find the bot.",
        href: "/dashboard",
        icon: "Sparkles",
        dedupeKey: `chime-vote:${voter}:${voteDay}`,
    });

    return NextResponse.json({ ok: true });
}
