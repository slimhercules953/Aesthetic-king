import {
    Boxes,
    Command,
    Eye,
    LockKeyhole,
    Palette,
    Sparkles,
    TrendingUp,
} from "lucide-react";

type ServerStudioNavProps = {
    guildId: string;
    active:
        | "overview"
        | "generation"
        | "commands"
        | "packs"
        | "appearance"
        | "access"
        | "analytics";
};

const items = [
    {
        id: "overview",
        label: "Overview",
        icon: Eye,
        path: "",
        enabled: true,
    },
    {
        id: "generation",
        label: "Generation",
        icon: Sparkles,
        path: "/generation",
        enabled: true,
    },
    {
        id: "commands",
        label: "Commands",
        icon: Command,
        path: "/commands",
        enabled: true,
    },
    {
        id: "packs",
        label: "Aesthetic Packs",
        icon: Boxes,
        path: "/packs",
        enabled: true,
    },
    {
        id: "appearance",
        label: "Appearance",
        icon: Palette,
        path: "/appearance",
        enabled: false,
    },
    {
        id: "access",
        label: "Access",
        icon: LockKeyhole,
        path: "/access",
        enabled: false,
    },
    {
        id: "analytics",
        label: "Analytics",
        icon: TrendingUp,
        path: "/analytics",
        enabled: false,
    },
] as const;

export default function ServerStudioNav({
    guildId,
    active,
}: ServerStudioNavProps) {
    return (
        <nav className="mt-8 overflow-x-auto border-b border-white/[0.06]">
            <div className="flex min-w-max gap-1">
                {items.map(
                    (
                        item
                    ) => {
                        const Icon =
                            item.icon;

                        const selected =
                            active ===
                            item.id;

                        const classes =
                            selected
                                ? "flex items-center gap-2 border-b-2 border-violet-500 px-4 py-3 text-sm font-medium text-violet-300"
                                : item.enabled
                                  ? "flex items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-zinc-500 transition hover:text-zinc-200"
                                  : "flex cursor-default items-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-zinc-700";

                        if (
                            !item.enabled
                        ) {
                            return (
                                <span
                                    key={
                                        item.id
                                    }
                                    className={
                                        classes
                                    }
                                >
                                    <Icon
                                        size={
                                            16
                                        }
                                    />
                                    {
                                        item.label
                                    }
                                </span>
                            );
                        }

                        return (
                            <a
                                key={
                                    item.id
                                }
                                href={`/dashboard/servers/${guildId}${item.path}`}
                                className={
                                    classes
                                }
                            >
                                <Icon
                                    size={
                                        16
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
        </nav>
    );
}
