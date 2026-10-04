import {
    NextRequest,
    NextResponse,
} from "next/server";

import {
    constantTimeEquals,
} from "../../../../lib/auth";

import {
    awardForTopggVote,
} from "../../../../lib/crownEarning";

import {
    createNotificationForDiscordUser,
} from "../../../../lib/notifications";

/*
 * Top.gg vote webhook.
 *
 * Top.gg POSTs a JSON body on every vote:
 *   { "botId": "...", "user": "<discord user id>", "type": "upvote",
 *     "query": null, "isWeekend": false }
 *
 * Two things about that payload decide the shape of this handler. It is
 * unauthenticated apart from the secret Top.gg sends in the `Authorization`
 * header, so anyone who learns the URL can mint Crowns unless that header is
 * verified. And it is delivered more than once — Top.gg retries on any
 * non-2xx, including a transient database error — so the handler must be
 * safe to call twice, which is what the per-voter idempotency key in
 * `crownEarning.ts` is for.
 *
 * A vote from an account that has never signed into the Studio is dropped
 * rather than provisioned: `awardCrowns` only writes for an existing user,
 * so creating a row here would invent accounts from a webhook body.
 */

function unauthorized(): NextResponse {
    return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
    );
}

export async function POST(
    request: NextRequest
) {
    const expected = (
        process.env.TOPGG_WEBHOOK_SECRET ?? ""
    ).trim();

    // Unconfigured means the endpoint does not exist yet. Answering 404
    // rather than 500 keeps an unprovisioned deploy from looking broken to
    // Top.gg, which would otherwise keep retrying it.
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
        user?: unknown;
        type?: unknown;
    };

    /*
     * Top.gg sends a `test` vote when the webhook is first saved, and a
     * `revote` when a vote is changed. Paying for the test click would be
     * free Crowns; a revote is the same person's single vote.
     */
    if (
        typeof payload.type === "string" &&
        payload.type !== "upvote"
    ) {
        return NextResponse.json({
            ok: true,
            ignored: true,
        });
    }

    const voter = String(
        payload.user ?? ""
    ).trim();

    if (!/^\d{17,20}$/.test(voter)) {
        return NextResponse.json(
            { error: "Missing or invalid user id." },
            { status: 400 }
        );
    }

    await awardForTopggVote(voter);

    /*
     * The thank-you goes out on every counted vote, keyed by voter and
     * UTC day so Top.gg's retries cannot stack identical notices.
     */
    const voteDay = new Date()
        .toISOString()
        .slice(0, 10);

    await createNotificationForDiscordUser(voter, {
        type: "VOTE",
        title: "Thanks for voting for Aesthetic King!",
        /*
         * Deliberately says nothing about Crowns. The award above is
         * gated on this deployment having a webhook secret, so on any
         * deploy that predates it the only thing a voter could read is
         * this notice — and a thank-you that hints at a reward they did
         * not receive reads worse than one that does not.
         */
        body: "Your vote helps more servers find the bot.",
        href: "/dashboard",
        icon: "Sparkles",
        dedupeKey: `topgg-vote:${voter}:${voteDay}`,
    });

    return NextResponse.json({ ok: true });
}
