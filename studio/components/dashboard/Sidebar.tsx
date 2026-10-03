"use client";

import {
    Activity,
    Boxes,
    CircleUserRound,
    Coins,
    Compass,
    CreditCard,
    Crown,
    FolderHeart,
    Home,
    Images,
    ImagePlus,
    Palette,
    Plus,
    Server,
    Settings,
    Sparkles,
    X,
} from "lucide-react";

import {
    usePathname,
} from "next/navigation";

import {
    useState,
} from "react";

import LogoutButton from "./LogoutButton";

type SidebarProps = {
    username: string;
};

const primaryNavigation = [
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
];

const serverNavigation = [
    {
        label: "My Servers",
        href: "/dashboard/servers",
        icon: Server,
    },
    {
        label: "Server Studio",
        href: "/dashboard/server-studio",
        icon: Boxes,
        premium: true,
    },
];

const premiumNavigation = [
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
        label: "Crowns",
        href: "/dashboard/premium/crowns",
        icon: Coins,
    },
    {
        label: "Billing",
        href: "/dashboard/premium/billing",
        icon: CreditCard,
    },
];

export default function Sidebar({
    username,
}: SidebarProps) {
    const pathname =
        usePathname();

    const [
        accountMenuOpen,
        setAccountMenuOpen,
    ] = useState(false);

    function isActive(
        href: string
    ) {
        if (
            href ===
            "/dashboard"
        ) {
            return (
                pathname ===
                "/dashboard"
            );
        }

        return pathname.startsWith(
            href
        );
    }

    return (
        <aside className="hidden h-full w-[270px] shrink-0 overflow-hidden border-r border-white/[0.06] bg-[#0b0b10] lg:flex lg:flex-col">
            <div className="flex h-20 shrink-0 items-center border-b border-white/[0.06] px-6">
                <a
                    href="/dashboard"
                    className="flex items-center gap-3"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
                        <Crown
                            size={20}
                            strokeWidth={2.2}
                        />
                    </div>

                    <div>
                        <p className="font-semibold tracking-tight text-white">
                            Aesthetic King
                        </p>

                        <p className="text-xs text-zinc-500">
                            Studio
                        </p>
                    </div>
                </a>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Studio
                </p>

                <nav className="space-y-1">
                    {primaryNavigation.map(
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
                                    className={[
                                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                        active
                                            ? "bg-violet-500/12 text-violet-300 shadow-inner shadow-violet-500/5"
                                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                                    ].join(
                                        " "
                                    )}
                                >
                                    <Icon
                                        size={
                                            18
                                        }
                                        className={
                                            active
                                                ? "text-violet-400"
                                                : "text-zinc-600 transition group-hover:text-zinc-400"
                                        }
                                    />

                                    {
                                        item.label
                                    }

                                    {active && (
                                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.8)]" />
                                    )}
                                </a>
                            );
                        }
                    )}
                </nav>

                <div className="my-5 border-t border-white/[0.05]" />

                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Discord
                </p>

                <nav className="space-y-1">
                    {serverNavigation.map(
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
                                    className={[
                                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                        active
                                            ? "bg-violet-500/12 text-violet-300"
                                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                                    ].join(
                                        " "
                                    )}
                                >
                                    <Icon
                                        size={
                                            18
                                        }
                                        className="text-zinc-600 transition group-hover:text-zinc-400"
                                    />

                                    {
                                        item.label
                                    }

                                    {item.premium && (
                                        <span className="ml-auto rounded-full bg-gradient-to-r from-amber-400/15 to-violet-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                                            Pro
                                        </span>
                                    )}
                                </a>
                            );
                        }
                    )}
                </nav>

                <div className="my-5 border-t border-white/[0.05]" />

                <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                    Membership
                </p>

                <nav className="space-y-1">
                    {premiumNavigation.map(
                        (item) => {
                            const Icon =
                                item.icon;

                            const active =
                                item.href ===
                                    "/dashboard/premium"
                                    ? pathname ===
                                        item.href
                                    : pathname.startsWith(
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
                                    className={[
                                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                        active
                                            ? "bg-violet-500/12 text-violet-300"
                                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
                                    ].join(
                                        " "
                                    )}
                                >
                                    <Icon
                                        size={
                                            18
                                        }
                                        className={
                                            active
                                                ? "text-amber-300"
                                                : "text-zinc-600 transition group-hover:text-zinc-400"
                                        }
                                    />

                                    {
                                        item.label
                                    }
                                </a>
                            );
                        }
                    )}
                </nav>
            </div>

            <div className="relative shrink-0 border-t border-white/[0.05] bg-[#0b0b10] p-3">
                {accountMenuOpen && (
                    <div className="absolute bottom-[76px] left-3 right-3 z-50 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111118] p-2 shadow-2xl shadow-black/50">
                        <div className="flex items-center justify-between px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-zinc-200">
                                    {username}
                                </p>

                                <p className="text-xs text-emerald-400">
                                    Discord connected
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setAccountMenuOpen(
                                        false
                                    )
                                }
                                aria-label="Close account menu"
                                className="rounded-lg p-2 text-zinc-600 transition hover:bg-white/[0.05] hover:text-zinc-300"
                            >
                                <X
                                    size={15}
                                />
                            </button>
                        </div>

                        <div className="my-1 border-t border-white/[0.06]" />

                        <a
                            href="/dashboard/settings"
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
                        >
                            <Settings
                                size={17}
                            />

                            Account Settings
                        </a>

                        <LogoutButton />
                    </div>
                )}

                <a
                    href="/dashboard/premium"
                    className="mb-3 block rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/[0.05] to-transparent p-4 transition hover:border-violet-500/35"
                >
                    <div className="flex items-center gap-2 text-sm font-semibold text-violet-200">
                        <Crown
                            size={16}
                        />

                        Aesthetic King Pro
                    </div>

                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                        Advanced editing, collections, analysis, and more.
                    </p>
                </a>

                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold">
                            {username
                                .charAt(0)
                                .toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-200">
                                {
                                    username
                                }
                            </p>

                            <p className="text-xs text-emerald-400">
                                Discord connected
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setAccountMenuOpen(
                                    (current) =>
                                        !current
                                )
                            }
                            aria-label="Account menu"
                            aria-expanded={
                                accountMenuOpen
                            }
                            className={[
                                "rounded-lg p-2 transition",
                                accountMenuOpen
                                    ? "bg-violet-500/10 text-violet-300"
                                    : "text-zinc-600 hover:bg-white/[0.05] hover:text-zinc-300",
                            ].join(
                                " "
                            )}
                        >
                            <Settings
                                size={
                                    16
                                }
                            />
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}