import {
    ArrowLeft,
    Crown,
    Sparkles,
} from "lucide-react";

import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import FavoriteButton from "../../../../components/assets/FavoriteButton";

import PremiumAssetLock from "../../../../components/assets/PremiumAssetLock";

import AddToCollectionButton from "../../../../components/collections/AddToCollectionButton";

import ShareToFeedButton from "../../../../components/feed/ShareToFeedButton";

import {
    getAssetSetById,
    isPremiumSet,
} from "../../../../lib/assetCatalog";

import {
    buildDeniedBody,
} from "../../../../lib/gate";

import {
    getFeatureAccess,
} from "../../../../lib/featureAccess";

import {
    getCollectionsForAsset,
} from "../../../../lib/collections";

import {
    isAssetSetFavorited,
} from "../../../../lib/favorites";

import {
    getR2AssetUrl,
} from "../../../../lib/r2Assets";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../../lib/session";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

function titleCase(
    value: string
) {
    return value
        .split(/[-_]/)
        .map(
            (part) =>
                part
                    .charAt(0)
                    .toUpperCase() +
                part.slice(1)
        )
        .join(" ");
}

export default async function AssetDetailPage({
    params,
}: PageProps) {
    const {
        id,
    } =
        await params;

    const set =
        getAssetSetById(
            id
        );

    if (!set) {
        notFound();
    }

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

    const premium = isPremiumSet(set.id);

    const [
        favorited,
        collections,
        assetsAccess,
    ] =
        await Promise.all([
            isAssetSetFavorited(
                session.discordId,
                set.id
            ),

            getCollectionsForAsset(
                session.discordId,
                set.id
            ),

            premium
                ? getFeatureAccess(
                      session.discordId,
                      "PREMIUM_ASSETS"
                  )
                : null,
        ]);

    // Only a real access record can produce a denial, which keeps the
    // locked branch type-safe further down. The plan is lowercased to
    // match the client-side denial shape used by UpgradePrompt, which
    // normally gets it that way from `readDeniedBody`.
    const lockedDenial =
        assetsAccess && !assetsAccess.allowed
            ? {
                  ...buildDeniedBody(assetsAccess),
                  plan:
                      assetsAccess.plan === "PREMIUM"
                          ? ("premium" as const)
                          : ("free" as const),
              }
            : null;

    const locked = lockedDenial !== null;

    const r2PublicUrl =
        process.env.R2_PUBLIC_URL;

    if (!r2PublicUrl) {
        throw new Error(
            "R2_PUBLIC_URL is not configured."
        );
    }

    return (
        <>
            <a
                href="/dashboard/assets"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft
                    size={16}
                />

                Asset Library
            </a>

            <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Profile Set
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        Set{" "}
                        {
                            set.id
                        }
                    </h1>

                    <p className="mt-3 text-zinc-500">
                        Matching profile picture and banner combination.
                    </p>

                    {premium && (
                        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
                            <Crown className="h-3.5 w-3.5" />
                            {locked
                                ? "Premium set"
                                : "Included with your plan"}
                        </p>
                    )}
                </div>

                {!locked && (
                    <div className="flex flex-wrap gap-3">
                        <ShareToFeedButton
                            itemType="ASSET"
                            itemId={
                                set.id
                            }
                            defaultTitle={
                                `Profile Set ${set.id}`
                            }
                        />

                        <FavoriteButton
                            setId={
                                set.id
                            }
                            assetKey={
                                set
                                    .assets
                                    .banner
                            }
                            initialFavorited={
                                favorited
                            }
                        />

                        <AddToCollectionButton
                            setId={
                                set.id
                            }
                            collections={
                                collections
                            }
                        />
                    </div>
                )}
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
                <section className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]">
                    <div className="relative h-64 overflow-hidden bg-zinc-900">
                        <img
                            src={getR2AssetUrl(
                                r2PublicUrl,
                                set
                                    .assets
                                    .banner
                            )}
                            alt={`Profile Set ${set.id} banner`}
                            className="h-full w-full object-cover"
                        />

                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#101015] to-transparent" />
                    </div>

                    <div className="relative px-7 pb-7 pt-16">
                        <div className="absolute -top-12 left-7 h-24 w-24 overflow-hidden rounded-full border-4 border-[#101015] bg-zinc-900 shadow-xl">
                            <img
                                src={getR2AssetUrl(
                                    r2PublicUrl,
                                    set
                                        .assets
                                        .pfp
                                )}
                                alt={`Profile Set ${set.id} profile picture`}
                                className="h-full w-full object-cover"
                            />
                        </div>

                        <h2 className="text-xl font-semibold">
                            Profile Set{" "}
                            {
                                set.id
                            }
                        </h2>

                        <p className="mt-2 text-sm text-zinc-500">
                            PFP:{" "}
                            <span className="font-mono">
                                {
                                    set
                                        .assets
                                        .pfp
                                }
                            </span>
                        </p>

                        <p className="mt-1 text-sm text-zinc-500">
                            Banner:{" "}
                            <span className="font-mono">
                                {
                                    set
                                        .assets
                                        .banner
                                }
                            </span>
                        </p>
                    </div>
                </section>

                <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                            <Sparkles
                                size={18}
                            />
                        </div>

                        <h2 className="font-semibold">
                            Metadata
                        </h2>
                    </div>

                    <MetadataGroup
                        title="Aesthetics"
                        values={
                            set.aesthetics
                        }
                    />

                    <MetadataGroup
                        title="Moods"
                        values={
                            set.moods
                        }
                    />

                    <MetadataGroup
                        title="Colors"
                        values={
                            set.colors
                        }
                    />
                </section>
            </div>

            {lockedDenial ? (
                <PremiumAssetLock
                    denied={lockedDenial}
                />
            ) : (
                <div className="mt-6 rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                        Asset Actions
                    </p>

                    <h2 className="mt-2 text-lg font-semibold">
                        Use this profile set
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                        Favorite this set, organize it into collections, or eventually use it directly inside the Aesthetic Studio.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <FavoriteButton
                            setId={
                                set.id
                            }
                            assetKey={
                                set
                                    .assets
                                    .banner
                            }
                            initialFavorited={
                                favorited
                            }
                        />

                        <AddToCollectionButton
                            setId={
                                set.id
                            }
                            collections={
                                collections
                            }
                        />

                        <button
                            type="button"
                            disabled
                            className="rounded-xl border border-white/[0.06] px-4 py-2.5 text-sm text-zinc-600"
                        >
                            Use in Aesthetic
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

function MetadataGroup({
    title,
    values,
}: {
    title: string;
    values: string[];
}) {
    return (
        <div className="mt-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-700">
                {
                    title
                }
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
                {values.map(
                    (value) => (
                        <span
                            key={
                                value
                            }
                            className="rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1.5 text-xs text-zinc-400"
                        >
                            {titleCase(
                                value
                            )}
                        </span>
                    )
                )}
            </div>
        </div>
    );
}