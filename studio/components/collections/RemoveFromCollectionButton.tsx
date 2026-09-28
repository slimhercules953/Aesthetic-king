"use client";

import {
    Trash2,
} from "lucide-react";

import {
    useRouter,
} from "next/navigation";

import {
    useState,
} from "react";

type Props = {
    collectionId: string;
    setId: string;
};

export default function RemoveFromCollectionButton({
    collectionId,
    setId,
}: Props) {
    const router =
        useRouter();

    const [
        busy,
        setBusy,
    ] = useState(false);

    async function remove() {
        setBusy(true);

        try {
            const response =
                await fetch(
                    "/api/collections/items",
                    {
                        method:
                            "DELETE",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify({
                                collectionId,
                                setId,
                            }),
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Unable to remove asset."
                );
            }

            router.refresh();
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            type="button"
            onClick={
                remove
            }
            disabled={
                busy
            }
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.04] px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
        >
            <Trash2
                size={14}
            />

            {busy
                ? "Removing..."
                : "Remove"}
        </button>
    );
}