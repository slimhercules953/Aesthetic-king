import {
    LucideIcon,
} from "lucide-react";

type StatCardProps = {
    label: string;
    value: string | number;
    detail?: string;
    icon: LucideIcon;
};

export default function StatCard({
    label,
    value,
    detail,
    icon: Icon,
}: StatCardProps) {
    return (
        <div className="group rounded-2xl border border-white/[0.06] bg-[#101015] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-violet-500/20 hover:bg-[#121218]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm text-zinc-500">
                        {label}
                    </p>

                    <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100">
                        {value}
                    </p>

                    {detail && (
                        <p className="mt-2 text-xs text-zinc-600">
                            {detail}
                        </p>
                    )}
                </div>

                <div className="rounded-xl border border-violet-500/10 bg-violet-500/[0.07] p-3 text-violet-400 transition group-hover:bg-violet-500/10">
                    <Icon
                        size={19}
                    />
                </div>
            </div>
        </div>
    );
}