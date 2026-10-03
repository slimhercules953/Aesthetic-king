"use client";

import {
    Bell,
    Crown,
    Menu,
    Search,
} from "lucide-react";

import {
    useState,
} from "react";

type TopbarProps = {
    username: string;
};

import LogoutButton from "./LogoutButton";

const mobileNavigation = [
    {
        label: "Home",
        href: "/dashboard",
    },
    {
        label: "Create",
        href: "/dashboard/create",
    },
    {
        label: "Image to Aesthetic",
        href: "/dashboard/image-to-aesthetic",
    },
    {
        label: "My Aesthetics",
        href: "/dashboard/aesthetics",
    },
    {
        label: "Assets",
        href: "/dashboard/assets",
    },
    {
        label: "Palettes",
        href: "/dashboard/palettes",
    },
    {
        label: "Collections",
        href: "/dashboard/collections",
    },
    {
        label: "My Servers",
        href: "/dashboard/servers",
    },
    {
        label: "Settings",
        href: "/dashboard/settings",
    },
];

export default function Topbar({
    username,
}: TopbarProps) {
    const [
        menuOpen,
        setMenuOpen,
    ] = useState(false);

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
                    className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5 text-zinc-400 transition hover:text-white lg:hidden"
                >
                    <Menu
                        size={20}
                    />
                </button>

                <div className="hidden max-w-md flex-1 md:block">
                    <div className="relative">
                        <Search
                            size={17}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600"
                        />

                        <input
                            type="text"
                            placeholder="Search Studio..."
                            className="h-11 w-full rounded-xl border border-white/[0.06] bg-white/[0.025] pl-10 pr-4 text-sm text-zinc-200 outline-none transition placeholder:text-zinc-600 focus:border-violet-500/40 focus:bg-white/[0.04]"
                        />
                    </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        className="relative rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-200"
                    >
                        <Bell
                            size={18}
                        />
                    </button>

                    <a
                        href="/dashboard/premium"
                        className="hidden items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-3.5 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/35 hover:bg-violet-500/15 sm:flex"
                    >
                        <Crown
                            size={16}
                        />

                        Upgrade
                    </a>

                    <div className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold shadow-lg shadow-violet-500/10">
                        {username
                            .charAt(0)
                            .toUpperCase()}
                    </div>
                </div>
            </header>

            {menuOpen && (
                <div className="fixed inset-x-4 top-24 z-50 rounded-2xl border border-white/[0.08] bg-[#101015]/95 p-3 shadow-2xl backdrop-blur-xl lg:hidden">
                    <div className="space-y-1">
                        {mobileNavigation.map(
                            (item) => (
                                <a
                                    key={
                                        item.href
                                    }
                                    href={
                                        item.href
                                    }
                                    onClick={() =>
                                        setMenuOpen(
                                            false
                                        )
                                    }
                                    className="block rounded-xl px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.05]"
                                >
                                    {
                                        item.label
                                    }
                                </a>
                            )
                        )}

                        <a
                            href="/api/auth/logout"
                            className="mt-2 block rounded-xl border border-white/[0.06] px-4 py-3 text-sm text-zinc-500"
                        >
                            <LogoutButton />
                        </a>
                    </div>
                </div>
            )}
        </>
    );
}