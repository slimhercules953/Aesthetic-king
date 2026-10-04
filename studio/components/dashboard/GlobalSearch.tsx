"use client";

import {
    Folder,
    Loader2,
    Palette,
    Search,
    Sparkles,
    User,
    Wand2,
} from "lucide-react";

import {
    useEffect,
    useRef,
    useState,
} from "react";

import {
    useRouter,
} from "next/navigation";

type SearchHit = {
    group: string;
    id: string;
    title: string;
    subtitle: string | null;
    href: string;
};

const groupLabels: Record<string, string> = {
    aesthetic: "Aesthetics",
    palette: "Palettes",
    profile: "Profiles",
    collection: "Collections",
    assetSet: "Asset sets",
};

const groupIcons: Record<string, typeof Search> = {
    aesthetic: Wand2,
    palette: Palette,
    profile: User,
    collection: Folder,
    assetSet: Sparkles,
};

export default function GlobalSearch() {
    const router = useRouter();

    const [term, setTerm] = useState("");
    const [items, setItems] = useState<SearchHit[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [active, setActive] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    /*
     * Debounced rather than per-keystroke. Each query fans out across four
     * tables, and nobody reads a result list that changes every 20ms.
     */
    useEffect(() => {
        const value = term.trim();

        if (value.length < 2) {
            setItems([]);
            setSearched(false);
            setLoading(false);
            return;
        }

        setLoading(true);

        const controller = new AbortController();

        const timer = setTimeout(async () => {
            try {
                const response = await fetch(
                    `/api/search?q=${encodeURIComponent(value)}`,
                    { signal: controller.signal, cache: "no-store" }
                );

                if (!response.ok) return;

                const data = (await response.json()) as {
                    items?: SearchHit[];
                };

                setItems(data.items ?? []);
                setActive(0);
                setSearched(true);
                setOpen(true);
            } catch (error) {
                if ((error as Error)?.name !== "AbortError") {
                    setItems([]);
                }
            } finally {
                setLoading(false);
            }
        }, 250);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [term]);

    useEffect(() => {
        if (!open) return;

        function onPointerDown(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open]);

    /*
     * Cmd/Ctrl+K focuses the box. The shortcut is the reason the input can
     * stay collapsed on small screens without feeling like a missing
     * feature.
     */
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === "k"
            ) {
                event.preventDefault();
                inputRef.current?.focus();
                inputRef.current?.select();
            }
        }

        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, []);

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
            return;
        }

        if (!items.length) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % items.length);
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index - 1 + items.length) % items.length);
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            const target = items[active];
            if (target) {
                setOpen(false);
                router.push(target.href);
            }
        }
    }

    // Group the flat list for section headings while keeping a single
    // arrow-key index over the original order.
    const sections: { label: string; rows: { hit: SearchHit; index: number }[] }[] = [];

    items.forEach((hit, index) => {
        const label = groupLabels[hit.group] ?? hit.group;
        const last = sections[sections.length - 1];

        if (last && last.label === label) {
            last.rows.push({ hit, index });
        } else {
            sections.push({ label, rows: [{ hit, index }] });
        }
    });

    const showPanel = open && term.trim().length >= 2;

    return (
        <div ref={containerRef} className="relative w-full">
            <Search
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
            />

            <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={showPanel}
                aria-controls="global-search-results"
                aria-autocomplete="list"
                value={term}
                onFocus={() => {
                    if (items.length) setOpen(true);
                }}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search your aesthetics, palettes, profiles…"
                className="h-11 w-full rounded-xl border border-white/[0.06] bg-white/[0.025] pl-10 pr-14 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40 focus:bg-white/[0.04]"
            />

            {loading ? (
                <Loader2
                    size={15}
                    className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-zinc-600"
                />
            ) : (
                <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 sm:block">
                    Ctrl K
                </kbd>
            )}

            {showPanel && (
                <div
                    id="global-search-results"
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[min(65vh,440px)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#101015]/98 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl"
                >
                    {sections.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-zinc-500">
                            {searched
                                ? `No matches for “${term.trim()}”`
                                : "Keep typing…"}
                        </p>
                    ) : (
                        sections.map((section) => (
                            <div key={section.label} className="mb-1 last:mb-0">
                                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
                                    {section.label}
                                </p>

                                {section.rows.map(({ hit, index }) => {
                                    const Icon =
                                        groupIcons[hit.group] ?? Search;

                                    return (
                                        <a
                                            key={`${hit.group}-${hit.id}`}
                                            href={hit.href}
                                            role="option"
                                            aria-selected={index === active}
                                            onMouseEnter={() => setActive(index)}
                                            onClick={() => setOpen(false)}
                                            className={[
                                                "flex items-center gap-3 rounded-xl px-3 py-2.5 transition",
                                                index === active
                                                    ? "bg-violet-500/12 text-violet-200"
                                                    : "text-zinc-300 hover:bg-white/[0.04]",
                                            ].join(" ")}
                                        >
                                            <Icon
                                                size={16}
                                                className={
                                                    index === active
                                                        ? "text-violet-300"
                                                        : "text-zinc-600"
                                                }
                                            />

                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm">
                                                    {hit.title}
                                                </span>

                                                {hit.subtitle && (
                                                    <span className="block truncate text-xs text-zinc-600">
                                                        {hit.subtitle}
                                                    </span>
                                                )}
                                            </span>
                                        </a>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
