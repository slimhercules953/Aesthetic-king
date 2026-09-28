"use client";

import {
    Check,
    Copy,
} from "lucide-react";

import {
    useState,
} from "react";

type CopyButtonProps = {
    value: string;
};

export default function CopyButton({
    value,
}: CopyButtonProps) {
    const [
        copied,
        setCopied,
    ] = useState(false);

    async function handleCopy() {
        await navigator.clipboard.writeText(
            value
        );

        setCopied(true);

        window.setTimeout(
            () => {
                setCopied(
                    false
                );
            },
            1600
        );
    }

    return (
        <button
            type="button"
            onClick={
                handleCopy
            }
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs font-medium text-zinc-400 transition hover:border-violet-500/25 hover:bg-violet-500/[0.06] hover:text-violet-300"
        >
            {copied ? (
                <>
                    <Check
                        size={14}
                    />

                    Copied
                </>
            ) : (
                <>
                    <Copy
                        size={14}
                    />

                    Copy
                </>
            )}
        </button>
    );
}