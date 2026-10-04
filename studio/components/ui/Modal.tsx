"use client";

import {
    createPortal,
} from "react-dom";

import type { ReactNode } from "react";

/**
 * A modal that is actually on top of everything.
 *
 * Every dialog in the Studio used to render its `fixed inset-0 z-50`
 * overlay exactly where the button that opens it lives. That works on a
 * plain page and silently fails inside a card: the library cards wrap
 * their content in `relative z-10`, which creates a stacking context,
 * and a `z-index` only competes *inside* the context it belongs to. The
 * overlay was therefore painted above its own card and below the sidebar
 * and header, so the page showed through the dialog as overlapping text.
 *
 * No `z-index` value fixes that, however large. The element has to leave
 * the ancestor that created the context, so this renders into
 * `document.body` instead.
 *
 * Callers only ever mount this while open, which is also why there is no
 * `mounted` guard: `document` is never touched during a server render.
 */
export default function Modal({
    children,
    className = "",
    label,
}: {
    children: ReactNode;

    /**
     * Extra classes for the overlay, for the rare dialog that wants a
     * different backdrop or alignment.
     */
    className?: string;

    /**
     * Accessible name. The dialogs already have a visible heading, but
     * the name has to sit on the element carrying `role="dialog"`.
     */
    label?: string;
}) {
    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={[
                "fixed inset-0 z-[100] flex items-center justify-center",
                "bg-black/70 p-4 backdrop-blur-sm",
                className,
            ].join(" ")}
        >
            {children}
        </div>,

        document.body
    );
}
