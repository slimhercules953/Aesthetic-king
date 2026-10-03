import ProfileWorkspace from "../../../components/profile/ProfileWorkspace";

import {
    loadProfileWorkspace,
} from "../../../lib/profileWorkspace";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const data =
        await loadProfileWorkspace();

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
