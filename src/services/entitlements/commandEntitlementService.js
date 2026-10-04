const {
    MessageFlags,
} = require("discord.js");

const {
    resolveFeatureAccess,
} = require("./featureAccessService");

const {
    buildFeatureLockedEmbed,
    buildPremiumLockedReply,
} = require("../../components/embeds/premiumLocked");

/*
 * Premium enforcement for slash commands.
 *
 * The per-set premium filter in `services/assets/premiumSets.js` is the right
 * shape for `/aesthetic` and `/profile`: a free user still gets the free
 * library, and only an exhausted free pool deserves an upsell. Other features
 * have no free subset to fall back on — `/analytics` either shows creator
 * statistics or it does not — and those read better as a single gate on the
 * command.
 *
 * Commands declare the gate the same way they declare
 * `requireGenerationChannel`: a property on the module, enforced by the
 * interaction pipeline. That keeps the check in one place, so a command cannot
 * ship without it by forgetting a line inside `execute`, and it is evaluated
 * before `execute` runs — which matters because an ephemeral upsell cannot be
 * produced out of an already-deferred public reply.
 */

/**
 * Human-readable names for gated features, used in the upsell.
 *
 * `studio/lib/features.ts` owns the registry and the labels shown in the
 * Studio. Only the features the bot can actually gate are listed here, so
 * adding a gate to a command is a deliberate two-line change rather than
 * whatever string a caller happens to pass.
 */
const GATED_COMMAND_FEATURES = {
    CREATOR_ANALYTICS: {
        label: "Creator Analytics",
        path: "/dashboard/analytics",
    },
};

/**
 * Reads the gate off a command module and validates it.
 *
 * An unrecognised `requiredFeature` is a typo in a command file, and the
 * failure mode of ignoring it is that a paid feature silently becomes free —
 * so it is reported loudly and the command is denied.
 */
function getRequiredFeature(command) {
    const feature = command?.requiredFeature ?? null;

    if (!feature) {
        return null;
    }

    if (!Object.prototype.hasOwnProperty.call(
        GATED_COMMAND_FEATURES,
        feature
    )) {
        return {
            feature,
            invalid: true,
        };
    }

    return {
        feature,
        invalid: false,
        ...GATED_COMMAND_FEATURES[feature],
    };
}

/**
 * Whether the member may run this command right now.
 *
 * Returns `{ allowed: true }` for ungated commands so the caller has one
 * shape to test.
 */
async function checkCommandFeatureAccess(
    command,
    discordUserId
) {
    const requirement = getRequiredFeature(command);

    if (!requirement) {
        return { allowed: true };
    }

    if (requirement.invalid) {
        console.error(
            `[entitlements] command "${command?.data?.name}" declares unknown requiredFeature "${requirement.feature}". Denying.`
        );

        return {
            allowed: false,
            feature: requirement.feature,
            label: "This feature",
            path: null,
            misconfigured: true,
        };
    }

    const allowed = await resolveFeatureAccess(
        discordUserId,
        requirement.feature
    );

    return {
        allowed,
        feature: requirement.feature,
        label: requirement.label,
        path: requirement.path,
    };
}

/**
 * The reply payload for a denied command.
 *
 * A misconfigured gate says so rather than claiming the feature is paid,
 * because the person on the receiving end cannot tell a bad config from a
 * real lock and would otherwise upgrade for nothing.
 */
function buildCommandFeatureLockedReply(requirement) {
    if (requirement.misconfigured) {
        return {
            content:
                "✦ That command is misconfigured right now, so it cannot run. Please try again later.",

            flags: MessageFlags.Ephemeral,
        };
    }

    return buildPremiumLockedReply(
        buildFeatureLockedEmbed(
            requirement.label,
            requirement.path ?? undefined
        )
    );
}

module.exports = {
    GATED_COMMAND_FEATURES,
    getRequiredFeature,
    checkCommandFeatureAccess,
    buildCommandFeatureLockedReply,
};
