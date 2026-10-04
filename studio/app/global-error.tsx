"use client";

import "./globals.css";

/**
 * Catches errors the root layout itself can throw — a broken `globals.css`,
 * a failing provider, anything that `app/error.tsx` cannot render inside.
 *
 * Next replaces the whole `<html>` tree with this component, so it has to
 * re-declare `html`, `body` and the stylesheet. Without it those failures show
 * the framework's unstyled default page.
 *
 * Must stay a client component: the framework renders it as an error-boundary
 * fallback, and passing a server component there breaks every page render.
 */
export default function GlobalError({
    reset,
}: {
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    background: "#08080c",
                    color: "#fff",
                    fontFamily:
                        "system-ui, -apple-system, Segoe UI, sans-serif",
                }}
            >
                <div
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.75rem",
                        padding: "1.5rem",
                        textAlign: "center",
                    }}
                >
                    <h1
                        style={{
                            margin: 0,
                            fontSize: "1.25rem",
                            fontWeight: 600,
                        }}
                    >
                        Aesthetic King could not load
                    </h1>

                    <p
                        style={{
                            margin: 0,
                            maxWidth: "26rem",
                            fontSize: "0.875rem",
                            lineHeight: 1.6,
                            color: "#a1a1aa",
                        }}
                    >
                        The app failed to start. Reloading usually fixes it.
                    </p>

                    <button
                        type="button"
                        onClick={reset}
                        style={{
                            marginTop: "1rem",
                            padding: "0.625rem 1.25rem",
                            fontSize: "0.875rem",
                            color: "#ddd6fe",
                            background:
                                "rgba(139,92,246,0.1)",
                            border:
                                "1px solid rgba(139,92,246,0.25)",
                            borderRadius: "0.75rem",
                            cursor: "pointer",
                        }}
                    >
                        Reload
                    </button>
                </div>
            </body>
        </html>
    );
}
