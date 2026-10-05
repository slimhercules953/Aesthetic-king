"use client";

import {
    LogOut,
} from "lucide-react";

import {
    useState,
} from "react";

/*
 * The default styling is the sidebar's quiet list-row. Settings and the mobile
 * menu pass their own `className` so the control matches where it sits.
 */
export default function LogoutButton({
    className = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:opacity-40",
}: {
    className?: string;
}) {
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
            /*
             * Never leave the user staring at a dead button. The cookie is
             * httpOnly, so the only way to clear it is the server; send the
             * browser to the endpoint directly and let it do the rest.
             */
            window.location.href =
                "/api/auth/logout";
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
            className={className}
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