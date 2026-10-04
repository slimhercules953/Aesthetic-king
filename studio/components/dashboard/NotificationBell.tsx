"use client";

import {
    Bell,
    Check,
    Crown,
    Heart,
    Server,
    Sparkles,
    X,
} from "lucide-react";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

type NotificationItem = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    href: string | null;
    icon: string | null;
    readAt: string | null;
    createdAt: string;
};

const icons: Record<string, typeof Bell> = {
    Bell,
    Crown,
    Heart,
    Server,
    Sparkles,
};

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";

    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));

    if (seconds < 60) return "just now";

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

export default function NotificationBell() {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const response = await fetch("/api/notifications", {
                cache: "no-store",
            });

            if (!response.ok) return;

            const data = (await response.json()) as {
                items?: NotificationItem[];
                unread?: number;
            };

            setItems(data.items ?? []);
            setUnread(data.unread ?? 0);
            setLoaded(true);
        } catch {
            // A failed poll must not blank out a list we already have.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    /*
     * The badge is polled rather than pushed. There is no websocket in this
     * deployment, and a two-minute interval is cheap: one indexed count per
     * tab, and it self-corrects whenever the tab regains focus.
     */
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.visibilityState === "visible") {
                void load();
            }
        }, 120_000);

        return () => clearInterval(interval);
    }, [load]);

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

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }

        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    async function markAllRead() {
        setItems((current) =>
            current.map((item) => ({ ...item, readAt: new Date().toISOString() }))
        );
        setUnread(0);

        await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true }),
        }).catch(() => undefined);
    }

    async function markOneRead(item: NotificationItem) {
        if (item.readAt) return;

        setItems((current) =>
            current.map((candidate) =>
                candidate.id === item.id
                    ? { ...candidate, readAt: new Date().toISOString() }
                    : candidate
            )
        );
        setUnread((count) => Math.max(0, count - 1));

        await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id }),
        }).catch(() => undefined);
    }

    async function remove(item: NotificationItem) {
        setItems((current) =>
            current.filter((candidate) => candidate.id !== item.id)
        );

        if (!item.readAt) {
            setUnread((count) => Math.max(0, count - 1));
        }

        await fetch(
            `/api/notifications?id=${encodeURIComponent(item.id)}`,
            { method: "DELETE" }
        ).catch(() => undefined);
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => {
                    setOpen((value) => !value);
                    if (!open && !loaded) void load();
                }}
                aria-label={
                    unread > 0
                        ? `Notifications, ${unread} unread`
                        : "Notifications"
                }
                aria-expanded={open}
                className="relative rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
            >
                <Bell size={18} />

                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold text-white shadow-lg shadow-violet-900/40">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101015]/98 shadow-2xl shadow-black/60 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                        <p className="text-sm font-semibold text-zinc-200">
                            Notifications
                        </p>

                        <div className="flex items-center gap-1">
                            {unread > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void markAllRead()}
                                    className="rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-violet-300"
                                >
                                    Mark all read
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close notifications"
                                className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[min(60vh,420px)] overflow-y-auto">
                        {items.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <Bell
                                    size={22}
                                    className="mx-auto text-zinc-700"
                                />

                                <p className="mt-3 text-sm text-zinc-500">
                                    Nothing yet
                                </p>

                                <p className="mt-1 text-xs text-zinc-600">
                                    Likes, Premium changes and bot updates
                                    show up here.
                                </p>
                            </div>
                        ) : (
                            items.map((item) => {
                                const Icon =
                                    icons[item.icon ?? ""] ?? Bell;

                                const isUnread = !item.readAt;

                                return (
                                    <div
                                        key={item.id}
                                        className={[
                                            "group relative flex gap-3 border-b border-white/[0.04] px-4 py-3 transition",
                                            isUnread
                                                ? "bg-violet-500/[0.05]"
                                                : "",
                                        ].join(" ")}
                                    >
                                        <span
                                            className={[
                                                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                                                isUnread
                                                    ? "border-violet-500/25 bg-violet-500/10 text-violet-300"
                                                    : "border-white/[0.06] bg-white/[0.03] text-zinc-600",
                                            ].join(" ")}
                                        >
                                            <Icon size={15} />
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            {item.href ? (
                                                <a
                                                    href={item.href}
                                                    onClick={() => {
                                                        void markOneRead(item);
                                                        setOpen(false);
                                                    }}
                                                    className="block"
                                                >
                                                    <p
                                                        className={[
                                                            "text-sm leading-snug",
                                                            isUnread
                                                                ? "font-medium text-zinc-100"
                                                                : "text-zinc-400",
                                                        ].join(" ")}
                                                    >
                                                        {item.title}
                                                    </p>

                                                    {item.body && (
                                                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                                                            {item.body}
                                                        </p>
                                                    )}

                                                    <p className="mt-1 text-[11px] text-zinc-600">
                                                        {relativeTime(
                                                            item.createdAt
                                                        )}
                                                    </p>
                                                </a>
                                            ) : (
                                                <div>
                                                    <p
                                                        className={[
                                                            "text-sm leading-snug",
                                                            isUnread
                                                                ? "font-medium text-zinc-100"
                                                                : "text-zinc-400",
                                                        ].join(" ")}
                                                    >
                                                        {item.title}
                                                    </p>

                                                    {item.body && (
                                                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                                                            {item.body}
                                                        </p>
                                                    )}

                                                    <p className="mt-1 text-[11px] text-zinc-600">
                                                        {relativeTime(
                                                            item.createdAt
                                                        )}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {isUnread && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void markOneRead(item)
                                                    }
                                                    aria-label="Mark as read"
                                                    title="Mark as read"
                                                    className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:bg-white/[0.06] hover:text-emerald-300 focus:opacity-100 group-hover:opacity-100"
                                                >
                                                    <Check size={14} />
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => void remove(item)}
                                                aria-label="Dismiss"
                                                title="Dismiss"
                                                className="rounded-lg p-1.5 text-zinc-700 opacity-0 transition hover:bg-white/[0.06] hover:text-zinc-300 focus:opacity-100 group-hover:opacity-100"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {loading && (
                        <p className="px-4 py-2 text-center text-[11px] text-zinc-600">
                            Refreshing…
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
