import ProfileWorkspace from "../../../../components/profile/ProfileWorkspace";

import {
    loadProfileWorkspace,
} from "../../../../lib/profileWorkspace";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ id: string }>;

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

export default async function ProfileByIdPage({
    params,
    searchParams,
}: PageProps) {
    const { id } = await params;
    const { set } = await searchParams;

    const data =
        await loadProfileWorkspace({
            profileId: id,
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
