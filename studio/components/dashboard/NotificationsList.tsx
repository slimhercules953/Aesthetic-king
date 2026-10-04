"use client";

import {
    Bell,
    Check,
    CheckCheck,
    Crown,
    Heart,
    Server,
    Sparkles,
    Trash2,
} from "lucide-react";

import {
    useState,
} from "react";

import type {
    NotificationItem,
} from "../../lib/notifications";

/*
 * The full-page counterpart to the bell dropdown.
 *
 * The dropdown is deliberately small: it fetches on open, it holds at most
 * `MAX_LIST` rows, and it closes the moment you click anything. This page is
 * where a notice goes when you want to act on it later, so it keeps the row
 * on screen after marking it read and offers a per-row delete — neither of
 * which fits in a popover that dismisses itself.
 *
 * Mutations go through the same `/api/notifications` route the bell uses. The
 * route identifies the owner from the session cookie, so nothing here can
 * address someone else's row.
 */
const icons: Record<string, typeof Bell> = {
    Bell,
    Crown,
    Heart,
    Server,
    Sparkles,
};

const TYPE_LABELS: Record<string, string> = {
    LIKE: "Likes",
    REMIX: "Remixes",
    PREMIUM_GRANTED: "Premium",
    PREMIUM_REVOKED: "Premium",
    PREMIUM_EXPIRING: "Premium",
    BOT_UPDATE: "Bot updates",
    VOTE: "Votes",
    SERVER: "Servers",
};

const FILTERS: {
    label: string;
    value: "all" | "unread";
}[] = [
    {
        label: "Everything",
        value: "all",
    },
    {
        label: "Unread",
        value: "unread",
    },
];

function formatDate(date: Date): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function NotificationsList({
    initialItems,
    initialUnread,
}: {
    initialItems: NotificationItem[];
    initialUnread: number;
}) {
    const [items, setItems] = useState(initialItems);
    const [filter, setFilter] = useState<"all" | "unread">("all");
    const [busy, setBusy] = useState(false);

    const unread = items.filter(
        (item) => item.readAt === null
    ).length;

    const shown =
        filter === "unread"
            ? items.filter((item) => item.readAt === null)
            : items;

    async function markAll() {
        if (busy || unread === 0) return;

        setBusy(true);

        try {
            const response = await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true }),
            });

            if (!response.ok) return;

            /*
             * `markAll` clears stored rows and dismisses patch notes, but the
             * expiry warning is derived from the live entitlement and stays.
             * Updating the rows we already hold is both cheaper than a refetch
             * and honest about which ones actually changed.
             */
            setItems((current) =>
                current.map((item) =>
                    item.readAt === null && isDismissable(item.id)
                        ? { ...item, readAt: new Date() }
                        : item
                )
            );
        } finally {
            setBusy(false);
        }
    }

    /*
     * Most rows are stored, but the list is a merge: patch notes are
     * synthesised from `PatchNote` (dismissable via the `patch:` id) and the
     * expiry warning is derived from the live entitlement. There is nothing to
     * mark read behind `expiry:`, so those rows are rendered without a
     * mark-read affordance rather than pretending to accept one.
     */
    function isDismissable(id: string): boolean {
        return !id.includes(":") || id.startsWith("patch:");
    }

    async function markOne(item: NotificationItem) {
        if (item.readAt !== null || !isDismissable(item.id)) return;

        setItems((current) =>
            current.map((row) =>
                row.id === item.id
                    ? { ...row, readAt: new Date() }
                    : row
            )
        );

        await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id }),
        });
    }

    async function remove(item: NotificationItem) {
        setItems((current) =>
            current.filter((row) => row.id !== item.id)
        );

        await fetch(
            `/api/notifications?id=${encodeURIComponent(item.id)}`,
            { method: "DELETE" }
        );
    }

    return (
        <div className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2">
                    {FILTERS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setFilter(option.value)}
                            aria-pressed={filter === option.value}
                            className={[
                                "rounded-xl border px-4 py-2 text-sm font-medium transition",
                                filter === option.value
                                    ? "border-violet-500/40 bg-violet-500/15 text-violet-200"
                                    : "border-white/[0.06] text-zinc-500 hover:border-white/[0.12] hover:text-zinc-200",
                            ].join(" ")}
                        >
                            {option.label}

                            {option.value === "unread" &&
                                initialUnread > 0 && (
                                    <span className="ml-2 text-xs text-zinc-500">
                                        {unread}
                                    </span>
                                )}
                        </button>
                    ))}
                </div>

                {unread > 0 && (
                    <button
                        type="button"
                        onClick={() => void markAll()}
                        disabled={busy}
                        className="ml-auto inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15 disabled:opacity-50"
                    >
                        <CheckCheck size={15} />

                        Mark all read
                    </button>
                )}
            </div>

            {shown.length === 0 ? (
                <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-20 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-300">
                        <Bell size={28} />
                    </div>

                    <h2 className="mt-6 text-xl font-semibold text-zinc-200">
                        {filter === "unread"
                            ? "Nothing left to read"
                            : "Nothing yet"}
                    </h2>

                    <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                        {filter === "unread"
                            ? "You are caught up. New likes, remixes and Premium changes will land here."
                            : "Likes, remixes, Premium changes and bot updates show up here as they happen."}
                    </p>

                    <a
                        href="/dashboard/discover"
                        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                    >
                        Browse Discover
                    </a>
                </div>
            ) : (
                <ul className="mt-6 space-y-2">
                    {shown.map((item) => {
                        const Icon =
                            icons[item.icon ?? ""] ?? Bell;

                        const isUnread = item.readAt === null;

                        const dismissable =
                            isDismissable(item.id);

                        const label =
                            TYPE_LABELS[item.type] ?? "Activity";

                        const body = (
                            <>
                                <span
                                    className={[
                                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                                        isUnread
                                            ? "border-violet-500/25 bg-violet-500/10 text-violet-300"
                                            : "border-white/[0.06] bg-white/[0.03] text-zinc-600",
                                    ].join(" ")}
                                >
                                    <Icon size={16} />
                                </span>

                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                                        {label}
                                    </p>

                                    <p
                                        className={[
                                            "mt-1 text-sm leading-snug",
                                            isUnread
                                                ? "font-medium text-zinc-100"
                                                : "text-zinc-400",
                                        ].join(" ")}
                                    >
                                        {item.title}
                                    </p>

                                    {item.body && (
                                        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                                            {item.body}
                                        </p>
                                    )}

                                    <p className="mt-1.5 text-[11px] text-zinc-600">
                                        {formatDate(item.createdAt)}
                                    </p>
                                </div>
                            </>
                        );

                        return (
                            <li
                                key={item.id}
                                className={[
                                    "flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition",
                                    isUnread
                                        ? "border-violet-500/20 bg-violet-500/[0.05]"
                                        : "border-white/[0.06] bg-white/[0.015]",
                                ].join(" ")}
                            >
                                {item.href ? (
                                    <a
                                        href={item.href}
                                        onClick={() => void markOne(item)}
                                        className="flex min-w-0 flex-1 gap-3"
                                    >
                                        {body}
                                    </a>
                                ) : dismissable ? (
                                    <button
                                        type="button"
                                        onClick={() => void markOne(item)}
                                        className="flex min-w-0 flex-1 gap-3 text-left"
                                    >
                                        {body}
                                    </button>
                                ) : (
                                    <div className="flex min-w-0 flex-1 gap-3">
                                        {body}
                                    </div>
                                )}

                                <div className="flex shrink-0 items-center gap-1">
                                    {isUnread && dismissable && (
                                        <button
                                            type="button"
                                            onClick={() => void markOne(item)}
                                            aria-label="Mark as read"
                                            title="Mark as read"
                                            className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.05] hover:text-violet-300"
                                        >
                                            <Check size={15} />
                                        </button>
                                    )}

                                    {dismissable && (
                                        <button
                                            type="button"
                                            onClick={() => void remove(item)}
                                            aria-label="Delete notification"
                                            title="Delete"
                                            className="rounded-lg p-2 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}