"use client";

import {
    Crown,
    Grid3X3,
    Heart,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";

import {
    getR2AssetUrl,
} from "../../lib/r2Assets";

import {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    usePathname,
    useRouter,
    useSearchParams,
} from "next/navigation";

import {
    ASSET_SORT_LABELS,
    ASSET_SORTS,
    EMPTY_ASSET_QUERY,
    buildAssetQuery,
    facetCounts,
    filterAssetSets,
    isAssetQueryEmpty,
    parseAssetQuery,
    sortAssetSets,
    toggleFacetValue,
} from "../../lib/assetQuery";

import type {
    AssetFacet,
    AssetQuery,
    AssetSort,
} from "../../lib/assetQuery";

import type {
    AssetCatalogSet,
} from "../../lib/assetCatalog";

type Filters = {
    aesthetics: string[];
    moods: string[];
    colors: string[];
    tags: string[];
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
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    /*
     * The URL is the only copy of the filters. Reloading keeps them, a
     * back press undoes the last change, and a filtered view can be
     * pasted to someone else.
     */
    const query = useMemo(
        () =>
            parseAssetQuery(
                searchParams as unknown as {
                    get: (name: string) => string | null;
                }
            ),
        [
            searchParams,
        ]
    );

    /*
     * The search box keeps its own draft so that typing does not push a
     * new URL per keystroke; it commits on submit or blur.
     */
    const [
        searchDraft,
        setSearchDraft,
    ] = useState(query.q);

    useEffect(
        () => {
            setSearchDraft(
                query.q
            );
        },
        [
            query.q,
        ]
    );

    function applyQuery(
        next: AssetQuery
    ) {
        const search =
            buildAssetQuery(
                next
            );

        router.replace(
            search
                ? `${pathname}?${search}`
                : pathname,
            {
                scroll: false,
            }
        );
    }

    function toggleFacet(
        facet: AssetFacet,
        value: string
    ) {
        applyQuery({
            ...query,
            [facet]: toggleFacetValue(
                query[facet],
                value
            ),
        });
    }

    function clearFilters() {
        applyQuery({
            ...EMPTY_ASSET_QUERY,
        });
    }

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

    const visible =
        useMemo(
            () =>
                sortAssetSets(
                    filterAssetSets(
                        sets,
                        query,
                        favoriteSetIdSet
                    ),
                    query.sort
                ),
            [
                sets,
                query,
                favoriteSetIdSet,
            ]
        );

    const filtersActive =
        !isAssetQueryEmpty(
            query
        );

    const activeChips =
        useMemo(
            () => [
                ...query.aesthetics.map(
                    (value) => ({
                        facet: "aesthetics" as const,
                        value,
                    })
                ),
                ...query.moods.map(
                    (value) => ({
                        facet: "moods" as const,
                        value,
                    })
                ),
                ...query.colors.map(
                    (value) => ({
                        facet: "colors" as const,
                        value,
                    })
                ),
                ...query.tags.map(
                    (value) => ({
                        facet: "tags" as const,
                        value,
                    })
                ),
            ],
            [
                query,
            ]
        );

    return (
        <>
            <div className="mt-8 rounded-2xl border border-white/[0.06] bg-[#101015] p-4">
                <div className="flex flex-col gap-3 lg:flex-row">
                    <form
                        onSubmit={(
                            event
                        ) => {
                            event.preventDefault();

                            applyQuery({
                                ...query,
                                q:
                                    searchDraft
                                        .trim(),
                            });
                        }}
                        className="relative flex-1"
                    >
                        <Search
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
                        />

                        <input
                            value={
                                searchDraft
                            }
                            onChange={(
                                event
                            ) =>
                                setSearchDraft(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Search sets, aesthetics, moods, colors, or tags..."
                            className="h-11 w-full rounded-xl border border-white/[0.06] bg-black/20 pl-10 pr-4 text-sm text-zinc-300 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/35"
                        />
                    </form>

                    <select
                        aria-label="Sort assets by"
                        value={
                            query.sort
                        }
                        onChange={(
                            event
                        ) =>
                            applyQuery({
                                ...query,
                                sort:
                                    event
                                        .target
                                        .value as AssetSort,
                            })
                        }
                        className="h-11 rounded-xl border border-white/[0.06] bg-[#0c0c11] px-3 text-sm text-zinc-400 outline-none transition focus:border-violet-500/35"
                    >
                        {ASSET_SORTS.map(
                            (value) => (
                                <option
                                    key={
                                        value
                                    }
                                    value={
                                        value
                                    }
                                >
                                    {
                                        ASSET_SORT_LABELS[
                                            value
                                        ]
                                    }
                                </option>
                            )
                        )}
                    </select>

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

                <div className="mt-4 space-y-3">
                    <FacetChips
                        label="Tags"
                        values={
                            filters.tags
                        }
                        selected={
                            query.tags
                        }
                        counts={
                            (value) =>
                                facetCounts(
                                    sets,
                                    query,
                                    "tags",
                                    value
                                )
                        }
                        onToggle={
                            (value) =>
                                toggleFacet(
                                    "tags",
                                    value
                                )
                        }
                    />

                    <FacetChips
                        label="Aesthetics"
                        values={
                            filters.aesthetics
                        }
                        selected={
                            query.aesthetics
                        }
                        counts={
                            (value) =>
                                facetCounts(
                                    sets,
                                    query,
                                    "aesthetics",
                                    value
                                )
                        }
                        onToggle={
                            (value) =>
                                toggleFacet(
                                    "aesthetics",
                                    value
                                )
                        }
                    />

                    <FacetChips
                        label="Colors"
                        values={
                            filters.colors
                        }
                        selected={
                            query.colors
                        }
                        counts={
                            (value) =>
                                facetCounts(
                                    sets,
                                    query,
                                    "colors",
                                    value
                                )
                        }
                        onToggle={
                            (value) =>
                                toggleFacet(
                                    "colors",
                                    value
                                )
                        }
                    />

                    <FacetChips
                        label="Moods"
                        values={
                            filters.moods
                        }
                        selected={
                            query.moods
                        }
                        counts={
                            (value) =>
                                facetCounts(
                                    sets,
                                    query,
                                    "moods",
                                    value
                                )
                        }
                        onToggle={
                            (value) =>
                                toggleFacet(
                                    "moods",
                                    value
                                )
                        }
                        collapsed={
                            !filtersActive
                        }
                    />
                </div>
            </div>

            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            applyQuery({
                                ...query,
                                favoritesOnly:
                                    false,
                            })
                        }
                        className={[
                            "rounded-xl px-4 py-2 text-sm font-medium transition",
                            !query.favoritesOnly
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
                            applyQuery({
                                ...query,
                                favoritesOnly:
                                    true,
                            })
                        }
                        className={[
                            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                            query.favoritesOnly
                                ? "bg-pink-500/10 text-pink-300"
                                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
                        ].join(
                            " "
                        )}
                    >
                        <Heart
                            size={15}
                            fill={
                                query.favoritesOnly
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
                                visible.length
                            }{" "}
                            profile sets
                        </span>
                    </div>

                    <div className="hidden items-center gap-2 text-xs text-zinc-600 sm:flex">
                        <SlidersHorizontal
                            size={14}
                        />

                        Filter by tag, aesthetic, color, and mood
                    </div>
                </div>
            </div>

            {activeChips.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                        Active
                    </span>

                    {activeChips.map(
                        (chip) => (
                            <button
                                key={`${chip.facet}:${chip.value}`}
                                type="button"
                                onClick={() =>
                                    toggleFacet(
                                        chip.facet,
                                        chip.value
                                    )
                                }
                                title="Remove this filter"
                                className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/25 bg-violet-500/[0.08] px-2.5 py-1 text-[11px] text-violet-200 transition hover:border-violet-500/45 hover:text-white"
                            >
                                {titleCase(
                                    chip.value
                                )}

                                <X
                                    size={11}
                                />
                            </button>
                        )
                    )}
                </div>
            )}

            {visible.length ===
            0 ? (
                <div className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-[#101015] p-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
                        {query.favoritesOnly ? (
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
                        {query.favoritesOnly
                            ? "No favorite asset sets"
                            : "No matching asset sets"}
                    </h2>

                    <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                        {query.favoritesOnly
                            ? "Open an asset set and add it to your favorites. It will appear here."
                            : "Facets are combined, so every filter must match at least once. Try removing one."}
                    </p>

                    <button
                        type="button"
                        onClick={
                            clearFilters
                        }
                        className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.07] px-4 py-2.5 text-sm text-violet-300"
                    >
                        {query.favoritesOnly
                            ? "View all assets"
                            : "Clear filters"}
                    </button>
                </div>
            ) : (
                <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {visible.map(
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
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
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

                                        <div className="mt-5">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                                                Tags
                                            </p>

                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {(
                                                    set.tags || []
                                                )
                                                    .slice(
                                                        0,
                                                        4
                                                    )
                                                    .map(
                                                        (
                                                            value
                                                        ) => (
                                                            <span
                                                                key={
                                                                    value
                                                                }
                                                                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[10px] text-zinc-500"
                                                            >
                                                                {titleCase(
                                                                    value
                                                                )}
                                                            </span>
                                                        )
                                                    )}

                                                {(
                                                    set.tags || []
                                                ).length >
                                                    4 && (
                                                    <span className="px-1 py-0.5 text-[10px] text-zinc-600">
                                                        +
                                                        {
                                                            set
                                                                .tags!
                                                                .length -
                                                            4
                                                        }
                                                    </span>
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

function FacetChips({
    label,
    values,
    selected,
    counts,
    onToggle,
    collapsed = false,
}: {
    label: string;
    values: string[];
    selected: string[];
    counts: (
        value: string
    ) => number;
    onToggle: (
        value: string
    ) => void;
    collapsed?: boolean;
}) {
    if (values.length === 0) {
        return null;
    }

    /*
     * A long facet is clipped until something is selected, at which
     * point the chosen values have to stay visible. `selected` values
     * are pulled to the front so clipping never hides one.
     */
    const ordered = [
        ...selected.filter(
            (value) =>
                values.includes(value)
        ),
        ...values.filter(
            (value) =>
                !selected.includes(value)
        ),
    ];

    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <span className="mt-1.5 w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                {label}
            </span>

            <div
                className={[
                    "flex flex-wrap gap-1.5",
                    collapsed
                        ? "max-h-[2.1rem] overflow-hidden"
                        : "",
                ].join(
                    " "
                )}
            >
                {ordered.map(
                    (value) => {
                        const active =
                            selected.includes(
                                value
                            );

                        const count = counts(
                            value
                        );

                        return (
                            <button
                                key={
                                    value
                                }
                                type="button"
                                onClick={() =>
                                    onToggle(
                                        value
                                    )
                                }
                                aria-pressed={
                                    active
                                }
                                className={[
                                    "rounded-full border px-2.5 py-1 text-[11px] transition",
                                    active
                                        ? "border-violet-500/40 bg-violet-500/[0.12] text-violet-200"
                                        : count === 0
                                          ? "border-white/[0.05] text-zinc-600 hover:text-zinc-300"
                                          : "border-white/[0.07] text-zinc-500 hover:border-white/15 hover:text-zinc-300",
                                ].join(
                                    " "
                                )}
                            >
                                {titleCase(
                                    value
                                )}

                                <span className="ml-1.5 text-[10px] text-zinc-600">
                                    {count}
                                </span>
                            </button>
                        );
                    }
                )}
            </div>
        </div>
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
