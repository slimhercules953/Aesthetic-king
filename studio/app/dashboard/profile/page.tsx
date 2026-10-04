import {
    dashboardMetadata,
} from "../../../lib/pageMetadata";

import ProfileWorkspace from "../../../components/profile/ProfileWorkspace";

import {
    loadProfileWorkspace,
} from "../../../lib/profileWorkspace";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams: Promise<{
        set?: string | string[];
    }>;
};

/**
 * `?set=` can arrive repeated (`?set=a&set=b`), and only the first one is
 * meaningful — the Builder takes a single set.
 */
function firstParam(
    value: string | string[] | undefined
): string | null {
    if (Array.isArray(value)) {
        return value[0] ?? null;
    }

    return value ?? null;
}

export const metadata =
    dashboardMetadata(
        "Profile Builder",
        "Compose banner, avatar, colours and bio together and preview the Discord profile as you change it."
    );

export default async function ProfilePage({
    searchParams,
}: PageProps) {
    const { set } = await searchParams;

    const data =
        await loadProfileWorkspace({
            initialSetId: firstParam(set),
        });

    return (
        <ProfileWorkspace
            profile={data.profile}
            profiles={data.profiles}
            sets={data.sets}
            fallbackUsername={
                data.fallbackUsername
            }
            advancedUnlocked={
                data.advancedUnlocked
            }
            canCreate={data.canCreate}
            initialSet={data.initialSet}
            completion={data.completion}
        />
    );
}
