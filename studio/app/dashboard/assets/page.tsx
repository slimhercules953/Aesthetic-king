import {
    dashboardMetadata,
} from "../../../lib/pageMetadata";

import {
    Images,
    Sparkles,
} from "lucide-react";

import AssetLibrary from "../../../components/assets/AssetLibrary";

import {
    cookies,
} from "next/headers";

import {
    getFavoriteAssetsByDiscordId,
} from "../../../lib/favorites";

import {
    getFeatureAccess,
} from "../../../lib/featureAccess";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    getAssetCatalogFilters,
    getAssetSets,
} from "../../../lib/assetCatalog";

export const metadata =
    dashboardMetadata(
        "Assets",
        "Every banner, avatar and image you have uploaded or generated."
    );

export default async function AssetsPage() {
    const sets =
        getAssetSets();

    const filters =
        getAssetCatalogFilters();
    const r2PublicUrl =
        process.env.R2_PUBLIC_URL;

    if (!r2PublicUrl) {
        throw new Error(
            "R2_PUBLIC_URL is not configured."
        );
    }

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

    const [favorites, assetsAccess] =
        await Promise.all([
            getFavoriteAssetsByDiscordId(
                session.discordId
            ),

            getFeatureAccess(
                session.discordId,
                "PREMIUM_ASSETS"
            ),
        ]);

    const favoriteSetIds =
        favorites
            .map(
                (favorite) =>
                    favorite.setId
            )
            .filter(
                (
                    setId
                ): setId is string =>
                    Boolean(
                        setId
                    )
            );
    return (
        <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Library
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        Asset Library
                    </h1>

                    <p className="mt-3 max-w-2xl text-zinc-500">
                        Browse matching profile picture and banner sets curated for Aesthetic King.
                    </p>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#101015] px-4 py-3">
                    <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                        <Images
                            size={18}
                        />
                    </div>

                    <div>
                        <p className="text-xs text-zinc-600">
                            Available sets
                        </p>

                        <p className="font-semibold text-zinc-200">
                            {
                                sets.length
                            }
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-violet-500/15 bg-gradient-to-r from-violet-500/[0.07] via-[#101015] to-fuchsia-500/[0.04] p-6">
                <div className="flex items-start gap-4">
                    <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-400">
                        <Sparkles
                            size={21}
                        />
                    </div>

                    <div>
                        <h2 className="font-semibold">
                            Matching Profile Sets
                        </h2>

                        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                            Every set contains a profile picture and banner designed to work together. Stack the filters to narrow the library - values within a row are alternatives, and rows combine - and the URL keeps whatever you land on so a view can be reloaded or shared.
                        </p>
                    </div>
                </div>
            </div>

            <AssetLibrary
                sets={
                    sets
                }
                filters={
                    filters
                }
                r2PublicUrl={
                    r2PublicUrl
                }
                favoriteSetIds={
                    favoriteSetIds
                }
                premiumUnlocked={
                    assetsAccess.allowed
                }
            />
        </>
    );
}