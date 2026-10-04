import ProfileWorkspace from "../../../../components/profile/ProfileWorkspace";

import {
    loadProfileWorkspace,
} from "../../../../lib/profileWorkspace";

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

export default async function NewProfilePage({
    searchParams,
}: PageProps) {
    const { set } = await searchParams;

    /*
     * `new` is a static segment, so Next matches it before the dynamic
     * /[id] route and this never reaches the id lookup.
     */
    const data =
        await loadProfileWorkspace({
            forceNew: true,
            initialSetId: firstParam(set),
        });

    return (
        <ProfileWorkspace
            profile={null}
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
