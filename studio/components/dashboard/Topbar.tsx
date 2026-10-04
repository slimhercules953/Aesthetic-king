"use client";

import {
    Activity,
    BarChart3,
    Bell,
    CircleUserRound,
    Coins,
    Compass,
    CreditCard,
    Crown,
    FolderHeart,
    Home,
    Images,
    ImagePlus,
    Menu,
    Palette,
    Plus,
    Server,
    Settings,
    Sparkles,
    X,
} from "lucide-react";

import {
    useState,
} from "react";

import {
    usePathname,
} from "next/navigation";

import GlobalSearch from "./GlobalSearch";
import NotificationBell from "./NotificationBell";

type TopbarProps = {
    username: string;
};

import LogoutButton from "./LogoutButton";

/*
 * The sidebar is `hidden lg:flex`, so below that breakpoint this list is the
 * only way into the product. It mirrors `Sidebar.tsx` group for group on
 * purpose: an earlier version carried ten links and silently dropped Discover
 * and the whole Premium group, which meant a phone could not reach the feed,
 * Crowns, Usage, Analytics or Billing at all.
 *
 * Keep both lists in step when a route is added.
 */
const mobileNavigationGroups: Array<{
    label: string;
    items: Array<{
        label: string;
        href: string;
        icon: typeof Home;
    }>;
}> = [
    {
        label: "Studio",
        items: [
            {
                label: "Home",
                href: "/dashboard",
                icon: Home,
            },
            {
                label: "Create",
                href: "/dashboard/create",
                icon: Plus,
            },
            {
                label: "Image to Aesthetic",
                href: "/dashboard/image-to-aesthetic",
                icon: ImagePlus,
            },
            {
                label: "Discover",
                href: "/dashboard/discover",
                icon: Compass,
            },
            {
                label: "My Aesthetics",
                href: "/dashboard/aesthetics",
                icon: Sparkles,
            },
            {
                label: "Profile Builder",
                href: "/dashboard/profile",
                icon: CircleUserRound,
            },
            {
                label: "Assets",
                href: "/dashboard/assets",
                icon: Images,
            },
            {
                label: "Palettes",
                href: "/dashboard/palettes",
                icon: Palette,
            },
            {
                label: "Collections",
                href: "/dashboard/collections",
                icon: FolderHeart,
            },
            {
                label: "Notifications",
                href: "/dashboard/notifications",
                icon: Bell,
            },
        ],
    },
    {
        label: "Servers",
        items: [
            {
                label: "My Servers",
                href: "/dashboard/servers",
                icon: Server,
            },
        ],
    },
    {
        label: "Premium",
        items: [
            {
                label: "Premium",
                href: "/dashboard/premium",
                icon: Crown,
            },
            {
                label: "Usage",
                href: "/dashboard/premium/usage",
                icon: Activity,
            },
            {
                label: "Analytics",
                href: "/dashboard/analytics",
                icon: BarChart3,
            },
            {
                label: "Crowns",
                href: "/dashboard/premium/crowns",
                icon: Coins,
            },
            {
                label: "Billing",
                href: "/dashboard/premium/billing",
                icon: CreditCard,
            },
        ],
    },
    {
        label: "Account",
        items: [
            {
                label: "Settings",
                href: "/dashboard/settings",
                icon: Settings,
            },
        ],
    },
];

export default function Topbar({
    username,
}: TopbarProps) {
    const [
        menuOpen,
        setMenuOpen,
    ] = useState(false);

    const pathname =
        usePathname();

    /*
     * Same rule the sidebar uses: the dashboard root only matches exactly,
     * otherwise it would light up on every nested route.
     */
    function isActive(
        href: string
    ) {
        return href === "/dashboard"
            ? pathname === href
            : pathname === href ||
                  pathname.startsWith(
                      `${href}/`
                  );
    }

    return (
        <>
            <header className="sticky top-0 z-40 flex h-20 items-center gap-4 border-b border-white/[0.06] bg-[#08080c]/85 px-5 backdrop-blur-xl lg:px-8">
                <button
                    type="button"
                    onClick={() =>
                        setMenuOpen(
                            !menuOpen
                        )
                    }
                    aria-expanded={
                        menuOpen
                    }
                    aria-controls="mobile-nav"
                    aria-label={
                        menuOpen
                            ? "Close navigation menu"
                            : "Open navigation menu"
                    }
                    className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5 text-zinc-400 transition hover:text-white lg:hidden"
                >
                    <Menu
                        size={20}
                    />
                </button>

                <div className="max-w-md flex-1">
                    <GlobalSearch />
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <NotificationBell />

                    <a
                        href="/dashboard/premium"
                        className="hidden items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3.5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/35 hover:bg-violet-500/15 sm:flex"
                    >
                        <Crown
                            size={16}
                        />

                        Upgrade
                    </a>

                    {/*
                     * On desktop the sidebar already owns the account card
                     * and its menu, so an avatar circle up here was a
                     * second, non-functional copy of the same identity.
                     * Below `lg` the sidebar is hidden, so this remains as
                     * the only account entry point and links to settings.
                     */}
                    <a
                        href="/dashboard/settings"
                        title={username}
                        aria-label={`Account settings for ${username}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold shadow-lg shadow-violet-500/10 transition hover:ring-2 hover:ring-violet-400/40 lg:hidden"
                    >
                        {username
                            .charAt(0)
                            .toUpperCase()}
                    </a>
                </div>
            </header>

            {menuOpen && (
                <div
                    id="mobile-nav"
                    className="fixed inset-x-4 top-24 z-50 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#101015]/95 p-3 shadow-2xl backdrop-blur-xl lg:hidden"
                >
                    {mobileNavigationGroups.map(
                        (group) => (
                            <div
                                key={
                                    group.label
                                }
                                className="mb-3 last:mb-0"
                            >
                                <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                                    {
                                        group.label
                                    }
                                </p>

                                <div className="space-y-1">
                                    {group.items.map(
                                        (item) => {
                                            const Icon =
                                                item.icon;

                                            const active =
                                                isActive(
                                                    item.href
                                                );

                                            return (
                                                <a
                                                    key={
                                                        item.href
                                                    }
                                                    href={
                                                        item.href
                                                    }
                                                    aria-current={
                                                        active
                                                            ? "page"
                                                            : undefined
                                                    }
                                                    onClick={() =>
                                                        setMenuOpen(
                                                            false
                                                        )
                                                    }
                                                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                                                        active
                                                            ? "bg-violet-500/10 font-medium text-violet-200"
                                                            : "text-zinc-300 hover:bg-white/[0.05]"
                                                    }`}
                                                >
                                                    <Icon
                                                        size={
                                                            16
                                                        }
                                                        className={
                                                            active
                                                                ? "text-violet-300"
                                                                : "text-zinc-600"
                                                        }
                                                    />

                                                    {
                                                        item.label
                                                    }
                                                </a>
                                            );
                                        }
                                    )}
                                </div>
                            </div>
                        )
                    )}

                    <a
                        href="/api/auth/logout"
                        className="mt-2 block rounded-xl border border-white/[0.06] px-4 py-3 text-sm text-zinc-500"
                    >
                        <LogoutButton />
                    </a>
                </div>
            )}
        </>
    );
}