import {
    dashboardMetadata,
} from "../../../../lib/pageMetadata";

import {
    ArrowLeft,
    FolderHeart,
    Palette,
} from "lucide-react";

import {
    cookies,
} from "next/headers";

import {
    notFound,
} from "next/navigation";

import CollectionActions from "../../../../components/collections/CollectionActions";
import RemoveFromCollectionButton from "../../../../components/collections/RemoveFromCollectionButton";
import RemovePaletteFromCollectionButton from "../../../../components/collections/RemovePaletteFromCollectionButton";

import {
    getAssetSetById,
} from "../../../../lib/assetCatalog";

import {
    getCollectionByIdForDiscordUser,
    getCollectionItems,
} from "../../../../lib/collections";

import {
    getSavedPaletteByIdForDiscordUser,
} from "../../../../lib/palettes";

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

export const metadata =
    dashboardMetadata(
        "Collection"
    );

export default async function CollectionDetailPage({
    params,
}: PageProps) {
    const {
        id,
    } =
        await params;

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

    const [
        collection,
        items,
    ] =
        await Promise.all([
            getCollectionByIdForDiscordUser(
                id,
                session.discordId
            ),

            getCollectionItems(
                id,
                session.discordId
            ),
        ]);

    if (!collection) {
        notFound();
    }

    const assetItems =
        items
            .filter(
                (item) =>
                    item.itemType ===
                    "ASSET"
            )
            .map(
                (item) => {
                    const asset =
                        getAssetSetById(
                            item.itemId
                        );

                    if (!asset) {
                        return null;
                    }

                    return {
                        item,
                        asset,
                    };
                }
            )
            .filter(
                (
                    entry
                ): entry is NonNullable<
                    typeof entry
                > =>
                    entry !== null
            );

    const paletteItemResults =
        await Promise.all(
            items
                .filter(
                    (item) =>
                        item.itemType ===
                        "PALETTE"
                )
                .map(
                    async (
                        item
                    ) => {
                        const palette =
                            await getSavedPaletteByIdForDiscordUser(
                                item.itemId,
                                session.discordId
                            );

                        if (!palette) {
                            return null;
                        }

                        return {
                            item,
                            palette,
                        };
                    }
                )
        );

    const paletteItems =
        paletteItemResults.filter(
            (
                entry
            ): entry is NonNullable<
                typeof entry
            > =>
                entry !== null
        );

    const r2PublicUrl =
        process.env.R2_PUBLIC_URL;

    if (!r2PublicUrl) {
        throw new Error(
            "R2_PUBLIC_URL is not configured."
        );
    }

    const isCompletelyEmpty =
        assetItems.length === 0 &&
        paletteItems.length === 0;

    return (
        <>
            <a
                href="/dashboard/collections"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft
                    size={16}
                />

                Collections
            </a>

            <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Collection
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        {
                            collection.name
                        }
                    </h1>

                    <p className="mt-3 max-w-2xl text-zinc-500">
                        {collection.description ||
                            "No description"}
                    </p>

                    <div className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
                        <FolderHeart
                            size={16}
                        />

                        {
                            items.length
                        }{" "}
                        {items.length === 1
                            ? "item"
                            : "items"}
                    </div>
                </div>

                <CollectionActions
                    id={
                        collection.id
                    }
                    currentName={
                        collection.name
                    }
                />
            </div>

            {isCompletelyEmpty && (
                <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                        <FolderHeart
                            size={24}
                        />
                    </div>

                    <h2 className="mt-5 text-xl font-semibold">
                        This collection is empty
                    </h2>

                    <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                        Add profile sets or saved palettes to start building this collection.
                    </p>

                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                        <a
                            href="/dashboard/assets"
                            className="rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-2.5 text-sm text-violet-300"
                        >
                            Browse Assets
                        </a>

                        <a
                            href="/dashboard/palettes"
                            className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 text-sm text-zinc-400"
                        >
                            Browse Palettes
                        </a>
                    </div>
                </div>
            )}

            {assetItems.length > 0 && (
                <section className="mt-8">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                            Profile Assets
                        </p>

                        <h2 className="mt-2 text-2xl font-semibold">
                            Asset Sets
                        </h2>
                    </div>

                    <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {assetItems.map(
                            ({
                                item,
                                asset,
                            }) => (
                                <article
                                    key={
                                        item.id
                                    }
                                    className="group overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015] transition duration-200 hover:-translate-y-1 hover:border-violet-500/20 hover:shadow-2xl hover:shadow-violet-950/20"
                                >
                                    <a
                                        href={`/dashboard/assets/${asset.id}`}
                                        className="block"
                                    >
                                        <div className="relative h-40 overflow-hidden bg-zinc-900">
                                            <img
                                                src={getR2AssetUrl(
                                                    r2PublicUrl,
                                                    asset
                                                        .assets
                                                        .banner
                                                )}
                                                alt={`Profile Set ${asset.id} banner`}
                                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                            />

                                            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#101015] to-transparent" />

                                            <div className="absolute bottom-4 left-5 h-16 w-16 overflow-hidden rounded-full border-4 border-[#101015] bg-zinc-900 shadow-xl">
                                                <img
                                                    src={getR2AssetUrl(
                                                        r2PublicUrl,
                                                        asset
                                                            .assets
                                                            .pfp
                                                    )}
                                                    alt={`Profile Set ${asset.id} profile picture`}
                                                    className="h-full w-full object-cover"
                                                />
                                            </div>

                                            <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-zinc-200 backdrop-blur">
                                                Set{" "}
                                                {
                                                    asset.id
                                                }
                                            </span>
                                        </div>
                                    </a>

                                    <div className="p-5 pt-6">
                                        <div className="flex flex-wrap gap-2">
                                            {asset.aesthetics
                                                .slice(
                                                    0,
                                                    3
                                                )
                                                .map(
                                                    (
                                                        aesthetic
                                                    ) => (
                                                        <span
                                                            key={
                                                                aesthetic
                                                            }
                                                            className="rounded-full border border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-1 text-[10px] font-medium text-violet-300"
                                                        >
                                                            {titleCase(
                                                                aesthetic
                                                            )}
                                                        </span>
                                                    )
                                                )}
                                        </div>

                                        <h3 className="mt-4 text-lg font-semibold">
                                            Profile Set{" "}
                                            {
                                                asset.id
                                            }
                                        </h3>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {asset.colors.map(
                                                (
                                                    color
                                                ) => (
                                                    <span
                                                        key={
                                                            color
                                                        }
                                                        className="text-xs text-zinc-600"
                                                    >
                                                        {titleCase(
                                                            color
                                                        )}
                                                    </span>
                                                )
                                            )}
                                        </div>

                                        <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
                                            <a
                                                href={`/dashboard/assets/${asset.id}`}
                                                className="text-xs text-violet-400 transition hover:text-violet-300"
                                            >
                                                Open asset
                                            </a>

                                            <RemoveFromCollectionButton
                                                collectionId={
                                                    collection.id
                                                }
                                                setId={
                                                    asset.id
                                                }
                                            />
                                        </div>
                                    </div>
                                </article>
                            )
                        )}
                    </div>
                </section>
            )}

            {paletteItems.length > 0 && (
                <section className="mt-10">
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                Colors
                            </p>

                            <h2 className="mt-2 text-2xl font-semibold">
                                Palettes
                            </h2>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-zinc-600">
                            <Palette
                                size={16}
                            />

                            {
                                paletteItems.length
                            }
                        </div>
                    </div>

                    <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {paletteItems.map(
                            ({
                                item,
                                palette,
                            }) => (
                                <article
                                    key={
                                        item.id
                                    }
                                    className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015]"
                                >
                                    <div
                                        className="grid h-32"
                                        style={{
                                            gridTemplateColumns:
                                                `repeat(${palette.colors.length}, minmax(0, 1fr))`,
                                        }}
                                    >
                                        {palette.colors.map(
                                            (
                                                color,
                                                index
                                            ) => (
                                                <div
                                                    key={`${color}-${index}`}
                                                    style={{
                                                        backgroundColor:
                                                            color,
                                                    }}
                                                />
                                            )
                                        )}
                                    </div>

                                    <div className="p-5">
                                        <h3 className="text-lg font-semibold">
                                            {palette.name ||
                                                "Untitled Palette"}
                                        </h3>

                                        <p className="mt-2 text-sm text-zinc-600">
                                            {palette.aestheticId ||
                                                "No aesthetic"}{" "}
                                            •{" "}
                                            {palette.moodId ||
                                                "No mood"}
                                        </p>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {palette.colors.map(
                                                (
                                                    color
                                                ) => (
                                                    <span
                                                        key={
                                                            color
                                                        }
                                                        className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 font-mono text-[10px] text-zinc-500"
                                                    >
                                                        {
                                                            color
                                                        }
                                                    </span>
                                                )
                                            )}
                                        </div>

                                        <div className="mt-5 flex items-center justify-end border-t border-white/[0.05] pt-4">
                                            <RemovePaletteFromCollectionButton
                                                collectionId={
                                                    collection.id
                                                }
                                                paletteId={
                                                    palette.id
                                                }
                                            />
                                        </div>
                                    </div>
                                </article>
                            )
                        )}
                    </div>
                </section>
            )}

            {items.some(
                (item) =>
                    item.itemType ===
                    "AESTHETIC"
            ) && (
                    <div className="mt-8 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-5 text-sm text-zinc-600">
                        This collection also contains saved aesthetics. Saved-aesthetic collection rendering will be added next.
                    </div>
                )}
        </>
    );
}