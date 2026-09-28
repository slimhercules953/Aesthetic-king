import {
    cookies,
} from "next/headers";

import PaletteStudio from "../../../components/palettes/PaletteStudio";

import {
    getCollectionsForPalette,
} from "../../../lib/collections";

import {
    getSavedPalettesByDiscordId,
} from "../../../lib/palettes";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

export default async function PalettesPage() {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        return null;
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        return null;
    }

    const palettes =
        await getSavedPalettesByDiscordId(
            session.discordId
        );

    const paletteCollections =
        Object.fromEntries(
            await Promise.all(
                palettes.map(
                    async (
                        palette
                    ) => [
                            palette.id,
                            await getCollectionsForPalette(
                                session.discordId,
                                palette.id
                            ),
                        ]
                )
            )
        );

    return (
        <>
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                    Colors
                </p>

                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                    Palette Studio
                </h1>

                <p className="mt-3 max-w-2xl text-zinc-500">
                    Build, save, and manage reusable color palettes for your Discord aesthetics.
                </p>
            </div>

            <div className="mt-8">
                <PaletteStudio
                    savedPalettes={
                        palettes
                    }
                    paletteCollections={
                        paletteCollections
                    }
                />
            </div>
        </>
    );
}