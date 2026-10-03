import ProfileWorkspace from "../../../../components/profile/ProfileWorkspace";

import {
    loadProfileWorkspace,
} from "../../../../lib/profileWorkspace";

export const dynamic = "force-dynamic";

export default async function NewProfilePage() {
    /*
     * `new` is a static segment, so Next matches it before the dynamic
     * /[id] route and this never reaches the id lookup.
     */
    const data =
        await loadProfileWorkspace({
            forceNew: true,
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
        />
    );
}
