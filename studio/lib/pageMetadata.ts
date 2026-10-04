import type {
    Metadata,
} from "next";

/**
 * Metadata for the signed-in part of the app.
 *
 * Two things matter here, and only one of them is the tab title:
 *
 * 1. Every `/dashboard` route sits behind a session cookie, so a crawler that
 *    followed one in would only ever record a redirect to the landing page.
 *    Indexing those URLs produces dead results, and worse, tells search
 *    engines our canonical content is a login bounce. Everything under here is
 *    therefore `noindex, nofollow` — the public surface is `/`, `/pricing`-style
 *    landing content, and `/u/[discordId]`.
 *
 * 2. Titles are written against the root template, so `title` here is the bare
 *    page name and renders as "Collections | Aesthetic King Studio".
 *
 * Keeping this in one function means a new page cannot accidentally become
 * indexable just because its author forgot the robots tag.
 */
export function dashboardMetadata(
    title: string,
    description?: string
): Metadata {
    return {
        title,
        ...(description
            ? { description }
            : {}),
        robots: "noindex, nofollow",
    };
}

/**
 * Metadata for a dynamic dashboard route whose page name is only known after
 * the record has loaded. Same indexing rules as above; the caller supplies the
 * resolved label so a browser tab or a restored session says which aesthetic is
 * open rather than showing a bare ID.
 */
export function dashboardRecordMetadata(
    noun: string,
    label: string | null | undefined,
    description?: string
): Metadata {
    const name =
        (label ?? "")
            .trim();

    return dashboardMetadata(
        name
            ? `${name} · ${noun}`
            : noun,
        description
    );
}
