import {
    dashboardMetadata,
} from "../../../lib/pageMetadata";

import {
    cookies,
} from "next/headers";

import {
    Bell,
} from "lucide-react";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

import {
    countUnread,
    listNotifications,
} from "../../../lib/notifications";

import NotificationsList from "../../../components/dashboard/NotificationsList";

export const metadata =
    dashboardMetadata(
        "Notifications",
        "Every like, remix, Premium change and bot update addressed to your account, in one list you can read at your own pace."
    );

export default async function NotificationsPage() {
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

    const [items, unread] = await Promise.all([
        listNotifications(session.discordId),
        countUnread(session.discordId),
    ]);

    return (
        <>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                        Account
                    </p>

                    <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                        Notifications
                    </h1>

                    <p className="mt-3 max-w-xl text-zinc-500">
                        {unread > 0
                            ? `${unread} unread ${unread === 1 ? "notice" : "notices"}. The bell in the topbar shows the most recent ones; everything is here.`
                            : "The bell in the topbar shows the most recent notices; the full history lives here."}
                    </p>
                </div>

                <a
                    href="/dashboard/discover"
                    className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15 sm:self-auto"
                >
                    <Bell
                        size={15}
                    />

                    Back to Discover
                </a>
            </div>

            <NotificationsList
                initialItems={items}
                initialUnread={unread}
            />
        </>
    );
}