"use client";

import {
    Crown,
    Grid3X3,
    Heart,
    Search,
    SlidersHorizontal,
} from "lucide-react";

import {
    getR2AssetUrl,
} from "../../lib/r2Assets";

import {
    useMemo,
    useState,
} from "react";

import type {
    AssetCatalogSet,
} from "../../lib/assetCatalog";

type Filters = {
    aesthetics: string[];
    moods: string[];
    colors: string[];
};

type AssetLibraryProps = {
    sets: AssetCatalogSet[];
    filters: Filters;
    r2PublicUrl: string;
    favoriteSetIds: string[];

    /**
     * Only changes the wording on the premium badge. The grid always
     * shows premium sets so there is something to unlock; the detail
     * page and the API are what actually refuse.
     */
    premiumUnlocked: boolean;
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

export default function AssetLibrary({
    sets,
    filters,
    r2PublicUrl,
    favoriteSetIds,
    premiumUnlocked,
}: AssetLibraryProps) {
    const [
        search,
        setSearch,
    ] = useState("");

    const [
        aesthetic,
        setAesthetic,
    ] = useState("");

    const [
        mood,
        setMood,
    ] = useState("");

    const [
        color,
        setColor,
    ] = useState("");

    const [
        favoritesOnly,
        setFavoritesOnly,
    ] = useState(false);

    const favoriteSetIdSet =
        useMemo(
            () =>
                new Set(
                    favoriteSetIds
                ),
            [
                favoriteSetIds,
            ]
        );

    const filtered =
        useMemo(
            () => {
                const query =
                    search
                        .trim()
                        .toLowerCase();

                return sets.filter(
                    (set) => {
                        if (
                            favoritesOnly &&
                            !favoriteSetIdSet.has(
                                set.id
                            )
                        ) {
                            return false;
                        }

                        if (
                            query &&
                            !set.id.includes(
                                query
                            ) &&
                            !set.aesthetics.some(
                                (
                                    value
                                ) =>
                                    value
                                        .toLowerCase()
                                        .includes(
                                            query
                                        )
                            ) &&
                            !set.moods.some(
                                (
                                    value
                                ) =>
                                    value
                                        .toLowerCase()
                                        .includes(
                                            query
                                        )
                            ) &&
                            !set.colors.some(
                                (
                                    value
                                ) =>
                                    value
                                        .toLowerCase()
                                        .includes(
                                            query
                                        )
                            )
                        ) {
                            return false;
                        }

                        if (
                            aesthetic &&
                            !set.aesthetics.includes(
                                aesthetic
                            )
                        ) {
                            return false;
                        }

                        if (
                            mood &&
                            !set.moods.includes(
                                mood
                            )
                        ) {
                            return false;
                        }

                        if (
                            color &&
                            !set.colors.includes(
                                color
                            )
                        ) {
                            return false;
                        }

                        return true;
                    }
                );
            },
            [
                sets,
                search,
                aesthetic,
                mood,
                color,
                favoritesOnly,
                favoriteSetIdSet,
            ]
        );

    function clearFilters() {
        setSearch("");
        setAesthetic("");
        setMood("");
        setColor("");
        setFavoritesOnly(
            false
        );
    }

    const filtersActive =
        Boolean(
            search ||
                aesthetic ||
                mood ||
                color ||
                favoritesOnly
        );

    return (
        <>
            <div className="mt-8 rounded-2xl border border-white/[0.06] bg-[#101015] p-4">
                <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                    <div className="relative">
                        <Search
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
                        />

                        <input
                            value={
                                search
                            }
                            onChange={(
                                event
                            ) =>
                                setSearch(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Search sets, aesthetics, moods, or colors..."
                            className="h-11 w-full rounded-xl border border-white/[0.06] bg-black/20 pl-10 pr-4 text-sm text-zinc-300 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/35"
                        />
                    </div>

                    <FilterSelect
                        value={
                            aesthetic
                        }
                        onChange={
                            setAesthetic
                        }
                        label="Aesthetic"
                        values={
                            filters.aesthetics
                        }
                    />

                    <FilterSelect
                        value={
                            mood
                        }
                        onChange={
                            setMood
                        }
                        label="Mood"
                        values={
                            filters.moods
                        }
                    />

                    <FilterSelect
                        value={
                            color
                        }
                        onChange={
                            setColor
                        }
                        label="Color"
                        values={
                            filters.colors
                        }
                    />

                    <button
                        type="button"
                        onClick={
                            clearFilters
                        }
                        disabled={
                            !filtersActive
                        }
                        className="h-11 rounded-xl border border-white/[0.06] px-4 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        Clear
                    </button>
                </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            setFavoritesOnly(
                                false
                            )
                        }
                        className={[
                            "rounded-xl px-4 py-2 text-sm font-medium transition",
                            !favoritesOnly
                                ? "bg-violet-500/10 text-violet-300"
                                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                        ].join(
                            " "
                        )}
                    >
                        All Assets
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setFavoritesOnly(
                                true
                            )
                        }
                        className={[
                            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                            favoritesOnly
                                ? "bg-pink-500/10 text-pink-300"
                                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                        ].join(
                            " "
                        )}
                    >
                        <Heart
                            size={15}
                            fill={
                                favoritesOnly
                                    ? "currentColor"
                                    : "none"
                            }
                        />

                        Favorites

                        {favoriteSetIds.length >
                            0 && (
                            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                                {
                                    favoriteSetIds.length
                                }
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <Grid3X3
                            size={16}
                        />

                        <span>
                            {
                                filtered.length
                            }{" "}
                            profile sets
                        </span>
                    </div>

                    <div className="hidden items-center gap-2 text-xs text-zinc-600 sm:flex">
                        <SlidersHorizontal
                            size={14}
                        />

                        Filter by aesthetic, mood, and color
                    </div>
                </div>
            </div>

            {filtered.length ===
            0 ? (
                <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                        {favoritesOnly ? (
                            <Heart
                                size={23}
                            />
                        ) : (
                            <Search
                                size={23}
                            />
                        )}
                    </div>

                    <h2 className="mt-5 text-xl font-semibold">
                        {favoritesOnly
                            ? "No favorite asset sets"
                            : "No matching asset sets"}
                    </h2>

                    <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                        {favoritesOnly
                            ? "Open an asset set and add it to your favorites. It will appear here."
                            : "Try removing a filter or searching for a different aesthetic."}
                    </p>

                    <button
                        type="button"
                        onClick={
                            clearFilters
                        }
                        className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-2.5 text-sm text-violet-300"
                    >
                        {favoritesOnly
                            ? "View all assets"
                            : "Clear filters"}
                    </button>
                </div>
            ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {filtered.map(
                        (set) => {
                            const isFavorite =
                                favoriteSetIdSet.has(
                                    set.id
                                );

                            return (
                                <a
                                    key={
                                        set.id
                                    }
                                    href={`/dashboard/assets/${set.id}`}
                                    className="group overflow-hidden rounded-3xl border border-white/[0.06] bg-[#101015] transition duration-200 hover:-translate-y-1 hover:border-violet-500/25 hover:shadow-2xl hover:shadow-violet-950/20"
                                >
                                    <div className="relative h-40 overflow-hidden bg-zinc-900">
                                        <img
                                            src={getR2AssetUrl(
                                                r2PublicUrl,
                                                set
                                                    .assets
                                                    .banner
                                            )}
                                            alt={`Profile Set ${set.id} banner`}
                                            loading="lazy"
                                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                        />

                                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#101015] to-transparent" />

                                        {isFavorite && (
                                            <span className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-pink-500/20 bg-black/55 text-pink-300 shadow-lg backdrop-blur">
                                                <Heart
                                                    size={
                                                        16
                                                    }
                                                    fill="currentColor"
                                                />
                                            </span>
                                        )}

                                        {set.premium === true && (
                                            <span
                                                title={
                                                    premiumUnlocked
                                                        ? "Premium profile set"
                                                        : "Premium profile set - unlock to use"
                                                }
                                                className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-amber-200 shadow-lg backdrop-blur"
                                            >
                                                <Crown
                                                    size={
                                                        13
                                                    }
                                                    fill="currentColor"
                                                />

                                                Premium
                                            </span>
                                        )}

                                        <div className="absolute bottom-4 left-5 h-16 w-16 overflow-hidden rounded-full border-4 border-[#101015] bg-zinc-900 shadow-xl">
                                            <img
                                                src={getR2AssetUrl(
                                                    r2PublicUrl,
                                                    set
                                                        .assets
                                                        .pfp
                                                )}
                                                alt={`Profile Set ${set.id} profile picture`}
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                            />
                                        </div>

                                        <span className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/50 px-3 py-1 text-xs text-zinc-200 backdrop-blur">
                                            Set{" "}
                                            {
                                                set.id
                                            }
                                        </span>
                                    </div>

                                    <div className="p-5 pt-6">
                                        <div className="flex flex-wrap gap-2">
                                            {set.aesthetics
                                                .slice(
                                                    0,
                                                    3
                                                )
                                                .map(
                                                    (
                                                        value
                                                    ) => (
                                                        <Tag
                                                            key={
                                                                value
                                                            }
                                                            value={
                                                                value
                                                            }
                                                        />
                                                    )
                                                )}
                                        </div>

                                        <h2 className="mt-4 text-lg font-semibold text-zinc-200 transition group-hover:text-white">
                                            Profile Set{" "}
                                            {
                                                set.id
                                            }
                                        </h2>

                                        <p className="mt-2 text-sm text-zinc-600">
                                            Matching profile picture and banner.
                                        </p>

                                        <div className="mt-5">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-700">
                                                Moods
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {set.moods
                                                    .slice(
                                                        0,
                                                        3
                                                    )
                                                    .map(
                                                        (
                                                            value
                                                        ) => (
                                                            <span
                                                                key={
                                                                    value
                                                                }
                                                                className="text-xs text-zinc-500"
                                                            >
                                                                {titleCase(
                                                                    value
                                                                )}
                                                            </span>
                                                        )
                                                    )}
                                            </div>
                                        </div>

                                        <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {set.colors.map(
                                                    (
                                                        value
                                                    ) => (
                                                        <span
                                                            key={
                                                                value
                                                            }
                                                            className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-600"
                                                        >
                                                            {
                                                                value
                                                            }
                                                        </span>
                                                    )
                                                )}
                                            </div>

                                            <span className="text-xs text-violet-500 opacity-0 transition group-hover:opacity-100">
                                                Open →
                                            </span>
                                        </div>
                                    </div>
                                </a>
                            );
                        }
                    )}
                </div>
            )}
        </>
    );
}

function FilterSelect({
    value,
    onChange,
    label,
    values,
}: {
    value: string;
    onChange: (
        value: string
    ) => void;
    label: string;
    values: string[];
}) {
    return (
        <select
            value={
                value
            }
            onChange={(
                event
            ) =>
                onChange(
                    event
                        .target
                        .value
                )
            }
            className="h-11 rounded-xl border border-white/[0.06] bg-[#0c0c11] px-3 text-sm text-zinc-400 outline-none transition focus:border-violet-500/35"
        >
            <option value="">
                All {label}s
            </option>

            {values.map(
                (value) => (
                    <option
                        key={
                            value
                        }
                        value={
                            value
                        }
                    >
                        {titleCase(
                            value
                        )}
                    </option>
                )
            )}
        </select>
    );
}

function Tag({
    value,
}: {
    value: string;
}) {
    return (
        <span className="rounded-full border border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-1 text-[10px] font-medium text-violet-300">
            {titleCase(
                value
            )}
        </span>
    );
}