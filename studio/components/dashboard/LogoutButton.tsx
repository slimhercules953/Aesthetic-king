"use client";

import {
    LogOut,
} from "lucide-react";

import {
    useState,
} from "react";

export default function LogoutButton() {
    const [
        signingOut,
        setSigningOut,
    ] = useState(false);

    async function logout() {
        if (signingOut) {
            return;
        }

        setSigningOut(true);

        try {
            const response =
                await fetch(
                    "/api/auth/logout",
                    {
                        method:
                            "POST",
                    }
                );

            if (!response.ok) {
                throw new Error(
                    "Unable to sign out."
                );
            }

            window.location.href =
                "/";
        } catch {
            setSigningOut(false);
        }
    }

    return (
        <button
            type="button"
            onClick={
                logout
            }
            disabled={
                signingOut
            }
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-40"
        >
            <LogOut
                size={17}
            />

            {signingOut
                ? "Signing Out..."
                : "Sign Out"}
        </button>
    );
}