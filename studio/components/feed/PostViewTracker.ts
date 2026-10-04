"use client";

import {
    useEffect,
    useRef,
} from "react";

/**
 * Reports that a feed card was genuinely looked at.
 *
 * Discover is a grid with no post pages, so "viewed this post" has to mean
 * "the card was on screen long enough to read". Three things follow from
 * that, and each one exists because the naive version is wrong:
 *
 *   1. An IntersectionObserver, not a mount effect. Every card on the page
 *      mounts at once; reporting on mount would credit a card two screens
 *      down with a viewer who never scrolled that far.
 *   2. A dwell time. Scrolling past a card at flick speed puts it in the
 *      viewport for a frame. The timer means a real pause, and it is cleared
 *      if the card leaves before it fires.
 *   3. A per-session set of reported ids. Cards unmount and remount on
 *      filter changes and router refreshes, and the server counts impressions
 *      too — without this, a re-render would inflate the number.
 *
 * The server still dedupes the audience and rejects the author's own views;
 * this only avoids pointless traffic.
 */

const VISIBILITY_RATIO = 0.6;
const DWELL_MS = 1_200;

const reported = new Set<string>();

export function usePostViewTracking(options: {
    postId: string;

    /** Null when nobody is signed in — anonymous browsing is not counted. */
    viewerDiscordId: string | null;

    authorDiscordId: string;
}) {
    const ref = useRef<HTMLElement | null>(null);

    const {
        postId,
        viewerDiscordId,
        authorDiscordId,
    } = options;

    const ownWork =
        viewerDiscordId !== null &&
        viewerDiscordId === authorDiscordId;

    useEffect(() => {
        const node = ref.current;

        if (!node || !viewerDiscordId || ownWork) {
            return;
        }

        if (reported.has(postId)) {
            return;
        }

        /*
         * Without an observer there is no way to know the card was seen, and
         * guessing "yes" would make the number meaningless. Silent is the
         * honest answer.
         */
        if (typeof IntersectionObserver === "undefined") {
            return;
        }

        let timer: ReturnType<
            typeof setTimeout
        > | null = null;

        let cancelled = false;

        const report = () => {
            if (cancelled || reported.has(postId)) {
                return;
            }

            reported.add(postId);

            /*
             * keepalive so the report survives the tab being backgrounded
             * straight after the dwell timer fires. The endpoint answers 204
             * and ignores failures, so there is nothing to handle here.
             */
            void fetch(
                `/api/feed/${postId}/view`,
                {
                    method: "POST",
                    keepalive: true,
                }
            ).catch(
                () => undefined
            );
        };

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (
                        entry.isIntersecting &&
                        entry.intersectionRatio >=
                            VISIBILITY_RATIO
                    ) {
                        if (timer !== null) {
                            continue;
                        }

                        timer = setTimeout(
                            report,
                            DWELL_MS
                        );
                    } else if (timer !== null) {
                        clearTimeout(timer);
                        timer = null;
                    }
                }
            },
            {
                threshold: [0, VISIBILITY_RATIO],
            }
        );

        observer.observe(node);

        return () => {
            cancelled = true;

            if (timer !== null) {
                clearTimeout(timer);
            }

            observer.disconnect();
        };
    }, [
        postId,
        viewerDiscordId,
        ownWork,
    ]);

    return ref;
}
