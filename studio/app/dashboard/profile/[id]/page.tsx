import ProfileWorkspace from "../../../../components/profile/ProfileWorkspace";

import {
    loadProfileWorkspace,
} from "../../../../lib/profileWorkspace";

export const dynamic = "force-dynamic";

export default async function ProfileByIdPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const data =
        await loadProfileWorkspace({
            profileId: id,
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
        />
    );
}
