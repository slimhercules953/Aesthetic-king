/**
 * The shape the Builder's set picker renders, plus how many sets it offers.
 *
 * This lives in its own module rather than in `profileSets.ts` because that
 * file resolves image URLs from the asset catalog and `R2_PUBLIC_URL`.
 * `ProfileBuilder` is a client component, and pulling those server-only
 * reads into the browser bundle would inline (or fail on) private env vars.
 * Everything here is plain data, so both sides can share one definition
 * instead of keeping two copies in sync.
 */
export type ProfileSetOption = {
    id: string;
    pfpUrl: string;
    bannerUrl: string;
    colors: string[];
    premium: boolean;
};

/**
 * How many sets the Builder offers.
 *
 * The catalog has 64 sets and the Builder's picker is a client component,
 * so every set costs bytes on every profile page load. Twenty-four fills
 * several rows of thumbnails, which is enough to browse and to find by id
 * or colour; the full filtered library is what /dashboard/assets is for.
 */
export const BUILDER_SET_LIMIT = 24;
