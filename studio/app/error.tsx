"use client";

import {
    useEffect,
} from "react";

/**
 * Last line of defence for any page under the root layout — including the
 * dashboard, which has no error boundary of its own. Without this, a throw
 * inside a server component unmounts the tree and the visitor gets a blank
 * dark screen with no explanation and no way back.
 *
 * `error.tsx` must be a client component, and it must accept `reset`.
 */
export default function GlobalErrorBoundary({
    error,
    reset,
}: {
    error: Error & {
        digest?: string;
    };
    reset: () => void;
}) {
    useEffect(
        () => {
            console.error(
                "[studio] unhandled render error",
                {
                    message:
                        error?.message,
                    digest:
                        error?.digest,
                }
            );
        },
        [
            error,
        ]
    );

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#08080c] px-6 text-center text-white">
            <h1 className="text-xl font-semibold text-zinc-200">
                Something broke
            </h1>

            <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">
                This page hit an unexpected error. Trying again usually works —
                if it keeps happening, the problem is on our side, not yours.
            </p>

            {error?.digest && (
                <p className="mt-4 font-mono text-[11px] text-zinc-700">
                    Reference: {error.digest}
                </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <button
                    type="button"
                    onClick={reset}
                    className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-5 py-2.5 text-sm font-medium text-violet-200 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                >
                    Try again
                </button>

                <a
                    href="/dashboard"
                    className="rounded-xl border border-white/[0.08] px-5 py-2.5 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
                >
                    Back to dashboard
                </a>
            </div>
        </div>
    );
}
