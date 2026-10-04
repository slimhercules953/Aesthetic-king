import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "./session";

import {
    getFeatureAccessMany,
} from "./featureAccess";

import {
    canCreateMoreProfiles,
    countProfilesForDiscordUser,
    getActiveProfileForDiscordUser,
    getProfileByIdForDiscordUser,
    getProfilesByDiscordId,
    type Profile,
} from "./profiles";

import {
    getBuilderSets,
    type ProfileSetOption,
} from "./profileSets";

/**
 * "Complete My Profile" allowance, flattened to what the panel needs.
 *
 * Deliberately not the whole `FeatureAccess`: that carries plan names,
 * period keys and unlock expiry, none of which the Builder renders, and a
 * server component should not hand a client component more about the
 * user's account than the UI asks for.
 */
export type CompletionAccess = {
    allowed: boolean;
    remaining: number | null;
    limit: number | null;
};

export type ProfileWorkspaceData = {
    profile: Profile | null;
    profiles: Profile[];
    sets: ProfileSetOption[];
    fallbackUsername: string | null;
    advancedUnlocked: boolean;
    canCreate: boolean;

    completion: CompletionAccess;
};

async function requireSession() {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        notFound();
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        notFound();
    }

    return session;
}

/**
 * Loads everything the three Builder routes need.
 *
 * The access lookup, the set list and the profile count are identical on
 * all three, so they resolve here once. `profileId` picks the row to
 * open: null with `forceNew` starts blank, null without it resumes the
 * active profile.
 */
export async function loadProfileWorkspace(
    options: {
        profileId?: string | null;
        forceNew?: boolean;
    } = {}
): Promise<ProfileWorkspaceData> {
    const session =
        await requireSession();

    const {
        profileId = null,
        forceNew = false,
    } = options;

    const [
        profiles,
        existingCount,
        access,
    ] = await Promise.all([
        getProfilesByDiscordId(
            session.discordId
        ),

        countProfilesForDiscordUser(
            session.discordId
        ),

        getFeatureAccessMany(
            session.discordId,
            [
                "ADVANCED_PROFILE_BUILDER",
                "PREMIUM_ASSETS",
                "COMPLETE_PROFILE_LIMIT",
            ]
        ),
    ]);

    const advancedUnlocked =
        access.ADVANCED_PROFILE_BUILDER.allowed;

    const premiumUnlocked =
        access.PREMIUM_ASSETS.allowed;

    let profile: Profile | null = null;

    if (profileId) {
        profile =
            await getProfileByIdForDiscordUser(
                profileId,
                session.discordId
            );

        /*
         * notFound() rather than a redirect: reaching another user's
         * profile id should look identical to reaching an id that does
         * not exist, so the status code cannot be used to probe which
         * ids belong to someone.
         */
        if (!profile) {
            notFound();
        }
    } else if (!forceNew) {
        profile =
            await getActiveProfileForDiscordUser(
                session.discordId
            );
    }

    const completionAccess =
        access.COMPLETE_PROFILE_LIMIT;

    return {
        profile,
        profiles,

        sets:
            getBuilderSets(
                premiumUnlocked
            ),

        fallbackUsername:
            session.username ?? null,

        advancedUnlocked,

        canCreate:
            canCreateMoreProfiles(
                existingCount,
                advancedUnlocked
            ),

        completion: {
            allowed:
                completionAccess.allowed,
            remaining:
                completionAccess.remaining,
            limit:
                completionAccess.limit,
        },
    };
}
