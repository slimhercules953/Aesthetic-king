"use client";

import {
    Heart,
} from "lucide-react";

import {
    useState,
} from "react";

type FavoriteButtonProps = {
    setId: string;
    assetKey: string;
    initialFavorited: boolean;
};

export default function FavoriteButton({
    setId,
    assetKey,
    initialFavorited,
}: FavoriteButtonProps) {
    const [
        favorited,
        setFavorited,
    ] = useState(
        initialFavorited
    );

    const [
        busy,
        setBusy,
    ] = useState(false);

    async function toggleFavorite() {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            const response =
                await fetch(
                    "/api/favorites",
                    {
                        method:
                            favorited
                                ? "DELETE"
                                : "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body:
                            JSON.stringify(
                                favorited
                                    ? {
                                          setId,
                                      }
                                    : {
                                          setId,
                                          assetKey,
                                      }
                            ),
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Favorite request failed."
                );
            }

            setFavorited(
                !favorited
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            type="button"
            onClick={
                toggleFavorite
            }
            disabled={
                busy
            }
            className={[
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition",
                favorited
                    ? "border-pink-500/25 bg-pink-500/10 text-pink-300"
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-pink-500/20 hover:bg-pink-500/[0.05] hover:text-pink-300",
            ].join(
                " "
            )}
        >
            <Heart
                size={16}
                fill={
                    favorited
                        ? "currentColor"
                        : "none"
                }
            />

            {busy
                ? "Saving..."
                : favorited
                ? "Favorited"
                : "Add to Favorites"}
        </button>
    );
}