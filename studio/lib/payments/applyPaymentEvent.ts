import { query } from "../database";

import {
    grantEntitlement,
    revokeEntitlementByExternalId,
} from "../entitlements";

import { createNotificationForDiscordUser } from "../notifications";

import { addMonths, findSellablePlan, isDiscordId } from "./catalog";

import type { PaymentEvent } from "./types";

/*
 * Applies decoded payment events to entitlements.
 *
 * This is the only place money is allowed to turn into access, which is
 * why it owns three things the routes and providers must not duplicate:
 * replay protection, the mapping from a plan id to an entitlement
 * window, and what happens when the account the event names does not
 * exist here.
 */

export type ApplyOutcome =
    | { status: "duplicate"; eventId: string }
    | { status: "ignored"; eventId: string; reason: string }
    | { status: "applied"; eventId: string; kind: PaymentEvent["kind"] }
    | { status: "failed"; eventId: string; reason: string };

/**
 * Claims an event id, returning false if it was already claimed.
 *
 * The insert is the lock: `ON CONFLICT DO NOTHING` plus the unique index
 * on (provider, externalEventId) means exactly one concurrent delivery
 * of the same event can win, which is what stops a Stripe retry storm
 * from granting Premium repeatedly.
 */
async function claimEvent(
    provider: string,
    event: PaymentEvent
): Promise<boolean> {
    const result = await query<{ id: string }>(
        `
        INSERT INTO "PaymentEventRecord"
            ("id", "provider", "externalEventId", "kind", "discordId", "payload", "processedAt")
        VALUES (
            gen_random_uuid()::text,
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            NOW()
        )
        ON CONFLICT ("provider", "externalEventId") DO NOTHING
        RETURNING "id"
        `,
        [
            provider,
            event.id,
            event.kind,
            isDiscordId(event.discordId) ? event.discordId : null,
            JSON.stringify(event.raw ?? {}),
        ]
    );

    return (result.rowCount ?? 0) > 0;
}

/**
 * Releases a claim so the provider's retry can try again.
 *
 * Without this, a transient database failure after the claim would leave
 * the event permanently marked as handled while nothing was actually
 * granted — the worst outcome, because the provider stops retrying and
 * the paying customer silently gets nothing.
 */
async function releaseClaim(
    provider: string,
    event: PaymentEvent
): Promise<void> {
    await query(
        `
        DELETE FROM "PaymentEventRecord"
        WHERE "provider" = $1 AND "externalEventId" = $2
        `,
        [provider, event.id]
    ).catch(() => undefined);
}

/**
 * Works out how long a purchase should last.
 *
 * The provider's own period end wins when it has one: for subscriptions
 * Stripe is the clock, and deriving a date here would drift from what
 * the customer was actually billed for. Only one-time purchases fall
 * back to the catalog duration, which the app owns.
 */
function resolveEndsAt(event: PaymentEvent): Date | null {
    if (event.currentPeriodEnd) {
        return event.currentPeriodEnd;
    }

    const plan = findSellablePlan(event.planId);

    if (!plan || plan.durationMonths === null) {
        return null;
    }

    return addMonths(new Date(), plan.durationMonths);
}

async function applyGrant(
    event: PaymentEvent,
    source: string
): Promise<ApplyOutcome> {
    if (!isDiscordId(event.discordId)) {
        /*
         * A paid event with no usable account is recorded but not
         * applied. Refusing here is safer than guessing an owner, and
         * the row keeps the event visible for manual reconciliation.
         */
        return {
            status: "ignored",
            eventId: event.id,
            reason: "no_valid_discord_id",
        };
    }

    const plan = findSellablePlan(event.planId);

    if (!plan) {
        return {
            status: "ignored",
            eventId: event.id,
            reason: `unknown_plan:${event.planId ?? "none"}`,
        };
    }

    const discordId = event.discordId.trim();

    /*
     * Null means the Discord account has never signed into the Studio,
     * so there is no user row to attach an entitlement to. The payment
     * is real, so this must not be treated as a failure to retry — the
     * provider would redeliver forever. It is surfaced as an ignored
     * event and the customer signs in to claim the grant on next
     * checkout-support contact.
     */
    const record = await grantEntitlement(discordId, {
        type: plan.entitlementType,
        source,
        startsAt: new Date(),
        endsAt: resolveEndsAt(event),
        skuId: event.skuId,
        externalEntitlementId: event.externalEntitlementId,
        /*
         * A purchase is never allowed to switch off an entitlement that
         * has no end date. Without this, a grandfathered account buying
         * Premium would lose the permanent grant the moment the webhook
         * landed, and would only get it back on its next login.
         */
        preservePermanent: true,
    });

    if (!record) {
        return {
            status: "ignored",
            eventId: event.id,
            reason: "no_such_user",
        };
    }

    return { status: "applied", eventId: event.id, kind: event.kind };
}

async function applyRevocation(
    event: PaymentEvent
): Promise<ApplyOutcome> {
    const externalId = (event.externalEntitlementId ?? "").trim();

    if (!externalId) {
        return {
            status: "ignored",
            eventId: event.id,
            reason: "no_external_entitlement_id",
        };
    }

    const count = await revokeEntitlementByExternalId(externalId);

    /*
     * `revokeEntitlementByExternalId` deliberately does not notify — it
     * has no account to notify. The event does, so the message is sent
     * here and only when a row actually ended, so a replay or an
     * already-expired grant stays quiet.
     */
    if (count > 0 && isDiscordId(event.discordId)) {
        await createNotificationForDiscordUser(event.discordId, {
            type: "PREMIUM_REVOKED",
            title:
                event.kind === "refund_issued"
                    ? "Premium ended after a refund"
                    : "Premium ended",
            body:
                event.kind === "refund_issued"
                    ? "The payment for your Premium plan was refunded, so Premium has ended. Nothing you created was deleted."
                    : "Your subscription has ended, so Premium is no longer active. Nothing you created was deleted.",
            href: "/dashboard/premium/billing",
            icon: "Crown",
            dedupeKey: `premium-revoked:provider:${externalId}`,
        });
    }

    return { status: "applied", eventId: event.id, kind: event.kind };
}

/**
 * Applies one verified event.
 *
 * Never throws for a business reason; every branch returns a labelled
 * outcome so the webhook route can answer 200 and stop retries while the
 * reason still reaches the logs. It throws only if the database itself
 * failed, in which case the route answers 500 and the provider retries.
 */
export async function applyPaymentEvent(
    provider: string,
    event: PaymentEvent
): Promise<ApplyOutcome> {
    if (!event.id) {
        return {
            status: "ignored",
            eventId: "",
            reason: "event_without_id",
        };
    }

    let claimed: boolean;

    try {
        claimed = await claimEvent(provider, event);
    } catch {
        /*
         * The claim is the guard against double-granting, so if it could
         * not be written nothing may be applied. Fail loudly and let the
         * provider retry.
         */
        return {
            status: "failed",
            eventId: event.id,
            reason: "claim_write_failed",
        };
    }

    if (!claimed) {
        return { status: "duplicate", eventId: event.id };
    }

    try {
        switch (event.kind) {
            case "checkout_completed":
            case "subscription_renewed":
                return await applyGrant(event, provider);

            case "subscription_canceled":
            case "refund_issued":
                return await applyRevocation(event);

            default:
                return {
                    status: "ignored",
                    eventId: event.id,
                    reason: "unhandled_kind",
                };
        }
    } catch (error) {
        await releaseClaim(provider, event);

        return {
            status: "failed",
            eventId: event.id,
            reason:
                error instanceof Error
                    ? error.message.slice(0, 200)
                    : "apply_failed",
        };
    }
}

/**
 * Applies a batch from one webhook delivery.
 *
 * A single Stripe event can decode into several app events (a charge
 * refund that also closes a subscription, for example), so every outcome
 * is reported rather than just the first. One failing event does not
 * stop the others: they are independent grants, and re-delivering an
 * already-applied one is harmless because of the claim.
 */
export async function applyPaymentEvents(
    provider: string,
    events: PaymentEvent[]
): Promise<ApplyOutcome[]> {
    const outcomes: ApplyOutcome[] = [];

    for (const event of events) {
        outcomes.push(await applyPaymentEvent(provider, event));
    }

    return outcomes;
}
