import {
    cookies,
} from "next/headers";

import {
    FolderHeart,
} from "lucide-react";

import CreateCollectionButton from "../../../components/collections/CreateCollectionButton";

import {
    getCollectionsByDiscordId,
    getCollectionItemCountByDiscordId,
} from "../../../lib/collections";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

export default async function CollectionsPage() {
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

    const [
        collections,
        itemCounts,
    ] = await Promise.all([
        getCollectionsByDiscordId(
            session.discordId
        ),
        getCollectionItemCountByDiscordId(
            session.discordId
        ),
    ]);

    const collectionsWithCounts =
        collections.map(
            (collection) => ({
                ...collection,
                itemCount:
                    itemCounts.get(
                        collection.id
                    ) ?? 0,
            })
        );

    return (
        <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Library
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        Collections
                    </h1>

                    <p className="mt-3 max-w-2xl text-zinc-500">
                        Organize your favorite assets and aesthetics into personal collections.
                    </p>
                </div>

                <CreateCollectionButton />
            </div>

            {collectionsWithCounts.length ===
            0 ? (
                <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                        <FolderHeart
                            size={24}
                        />
                    </div>

                    <h2 className="mt-5 text-xl font-semibold">
                        No collections yet
                    </h2>

                    <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                        Create a collection to organize profile sets, palettes, and saved aesthetics.
                    </p>
                </div>
            ) : (
                <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {collectionsWithCounts.map(
                        (
                            collection
                        ) => (
                            <a
                                key={
                                    collection.id
                                }
                                href={`/dashboard/collections/${collection.id}`}
                                className="group rounded-3xl border border-white/[0.06] bg-[#101015] p-6 transition duration-200 hover:-translate-y-1 hover:border-violet-500/20 hover:shadow-2xl hover:shadow-violet-950/20"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                                        <FolderHeart
                                            size={20}
                                        />
                                    </div>

                                    <span className="rounded-full border border-white/[0.06] bg-black/20 px-3 py-1 text-xs text-zinc-500">
                                        {
                                            collection.itemCount
                                        }{" "}
                                        items
                                    </span>
                                </div>

                                <h2 className="mt-6 text-xl font-semibold text-zinc-200 transition group-hover:text-white">
                                    {
                                        collection.name
                                    }
                                </h2>

                                <p className="mt-2 min-h-10 text-sm leading-5 text-zinc-600">
                                    {collection.description ||
                                        "No description"}
                                </p>

                                <div className="mt-6 border-t border-white/[0.05] pt-4 text-xs text-violet-500 opacity-0 transition group-hover:opacity-100">
                                    Open collection →
                                </div>
                            </a>
                        )
                    )}
                </div>
            )}
        </>
    );
}