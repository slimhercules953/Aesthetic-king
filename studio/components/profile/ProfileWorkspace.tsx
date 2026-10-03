import {
    CircleUserRound,
    Plus,
} from "lucide-react";

import ProfileBuilder from "./ProfileBuilder";

import type {
    Profile,
} from "../../lib/profiles";

import type {
    ProfileSetOption,
} from "../../lib/profileSets";

import {
    FREE_PROFILE_VERSIONS,
} from "../../lib/profileModel";

type ProfileWorkspaceProps = {
    profile: Profile | null;
    profiles: Profile[];
    sets: ProfileSetOption[];
    fallbackUsername: string | null;
    advancedUnlocked: boolean;
    canCreate: boolean;
};

/**
 * The Profile Builder page shell.
 *
 * Shared by `/dashboard/profile`, `/dashboard/profile/new` and
 * `/dashboard/profile/[id]` so the three cannot drift apart — they differ
 * only in which row they load, and a duplicated header or stat card is
 * exactly the kind of thing that quietly stays wrong.
 */
export default function ProfileWorkspace({
    profile,
    profiles,
    sets,
    fallbackUsername,
    advancedUnlocked,
    canCreate,
}: ProfileWorkspaceProps) {
    const active =
        profiles.find(
            (entry) => entry.isActive
        ) ?? null;

    return (
        <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Profile Builder
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        {profile?.name ??
                            "New profile"}
                    </h1>

                    <p className="mt-3 max-w-2xl text-zinc-500">
                        Compose a Discord profile and watch
                        the card change as you type.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {active && (
                        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#101015] px-4 py-3">
                            <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                                <CircleUserRound
                                    size={18}
                                />
                            </div>

                            <div>
                                <p className="text-xs text-zinc-600">
                                    Active profile
                                </p>

                                <p className="max-w-40 truncate font-semibold text-zinc-200">
                                    {active.name}
                                </p>
                            </div>
                        </div>
                    )}

                    {canCreate &&
                        profiles.length > 0 && (
                            <a
                                href="/dashboard/profile/new"
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] px-4 py-3.5 text-sm text-zinc-300 transition hover:border-violet-500/60 hover:text-violet-300"
                            >
                                <Plus size={16} />

                                New version
                            </a>
                        )}
                </div>
            </div>

            <div className="mt-8">
                <ProfileBuilder
                    profile={profile}
                    profiles={profiles}
                    sets={sets}
                    fallbackUsername={
                        fallbackUsername
                    }
                    advancedUnlocked={
                        advancedUnlocked
                    }
                    maxProfiles={
                        FREE_PROFILE_VERSIONS
                    }
                />
            </div>
        </>
    );
}
