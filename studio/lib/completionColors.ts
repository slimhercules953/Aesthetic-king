/**
 * The color names "Complete My Profile" can build a profile from.
 *
 * The asset catalog tags every set with color *names* rather than hex
 * values, so composing from a color needs a translation table. These are
 * representative hues for the fifteen names the catalog actually uses -
 * close enough to set the mood of a composition, and never used as the
 * final palette (the chosen set's real colors win).
 *
 * This lives in its own module because the seed picker needs the list of
 * names while the composer needs the map, and the composer also imports
 * `apiError.ts`, which imports `next/server`. Importing the composer from
 * a client component would drag server-only code into the browser bundle,
 * so both sides depend on this file instead.
 */
export const CATALOG_COLOR_HEX: Record<string, string> = {
    black: "#0B0B0D",
    white: "#F7F7F5",
    gray: "#9A9AA3",
    brown: "#7A5A3C",
    cream: "#EFE3CC",
    blue: "#3E6FA8",
    teal: "#2E8C86",
    green: "#5C8C55",
    yellow: "#D9B84A",
    orange: "#D2793C",
    red: "#B03A3A",
    pink: "#D08AA8",
    purple: "#7A5AA0",
    indigo: "#4A4E8F",
    gold: "#C9A227",
};

/**
 * The selectable color names, in the order the picker shows them.
 *
 * Derived from the map rather than written out again so the two cannot
 * drift: a name added here but not to the map would be offered by the UI
 * and rejected by the server.
 */
export const COMPLETABLE_COLOR_NAMES = Object.keys(
    CATALOG_COLOR_HEX
);
