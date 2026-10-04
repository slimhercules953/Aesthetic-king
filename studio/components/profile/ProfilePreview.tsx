import type {
    ProfilePreviewState,
} from "../../lib/profileModel";

type ProfilePreviewProps = {
    state: ProfilePreviewState;

    /**
     * Resolved pfp/banner image URLs. Null means the profile has no
     * profile set, so the card paints the palette instead — which is the
     * honest state, not a placeholder.
     */
    pfpUrl: string | null;
    bannerUrl: string | null;

    pronouns?: string | null;
    status?: string | null;
    bio?: string | null;
    symbols?: string[];
};

/**
 * A Discord profile card, drawn in DOM.
 *
 * The bot renders profiles with `node-canvas` in
 * `src/services/rendering/profileRenderer.js`. That cannot run here —
 * the Studio is a Workers app with no canvas binding — so the card is
 * markup instead. It is a plain server component with no state and no
 * handlers: every colour and string arrives already resolved in `state`,
 * which is why the fallback rules are testable in `profileModel.ts`
 * rather than buried in JSX.
 *
 * It is a likeness, not a pixel copy. Discord's own layout moves; the
 * useful property is that the palette, the set art and the text the user
 * typed compose the way they will read in the app.
 */
export default function ProfilePreview({
    state,
    pfpUrl,
    bannerUrl,
    pronouns,
    status,
    bio,
    symbols,
}: ProfilePreviewProps) {
    return (
        <div
            className="w-full max-w-[340px] overflow-hidden rounded-xl border border-white/[0.08] shadow-2xl shadow-black/50"
            style={{
                backgroundColor:
                    state.backgroundColor,
            }}
        >
            <div
                className="relative h-[72px]"
                style={{
                    backgroundColor:
                        state.bannerColor,
                }}
            >
                {bannerUrl && (
                    /*
                     * Not next/image: set art comes from R2 at a fixed
                     * small size, and a loader would add a fetch per
                     * preview re-render for no benefit at this scale.
                     */
                    <img
                        src={bannerUrl}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                )}
            </div>

            <div className="px-4 pb-4">
                {/*
                 * `relative z-10` is load-bearing, not tidiness. The
                 * banner above is `position: relative`, and a positioned
                 * element paints after unpositioned in-flow content no
                 * matter where it sits in the DOM — so pulling the avatar
                 * up with a negative margin alone left the banner art
                 * painted straight over it.
                 */}
                <div className="relative z-10 -mt-8 mb-2 flex justify-start">
                    <div
                        className="flex h-[68px] w-[68px] overflow-hidden rounded-full border-4"
                        style={{
                            borderColor:
                                state.backgroundColor,
                            backgroundColor:
                                state.bannerColor,
                        }}
                    >
                        {pfpUrl ? (
                            <img
                                src={pfpUrl}
                                alt=""
                                className="h-full w-full object-cover"
                            />
                        ) : (
                            <div
                                className="flex h-full w-full items-center justify-center text-xl font-bold"
                                style={{
                                    color:
                                        state.textColor,
                                }}
                            >
                                {state.initials}
                            </div>
                        )}
                    </div>
                </div>

                <p
                    className="truncate text-base font-semibold"
                    style={{
                        color: state.textColor,
                    }}
                >
                    {state.displayName}

                    {state.discriminator && (
                        <span
                            className="ml-1 text-sm font-normal"
                            style={{
                                color:
                                    state.mutedTextColor,
                            }}
                        >
                            {state.discriminator}
                        </span>
                    )}
                </p>

                {pronouns && (
                    <p
                        className="mt-0.5 truncate text-xs"
                        style={{
                            color:
                                state.mutedTextColor,
                        }}
                    >
                        {pronouns}
                    </p>
                )}

                {status && (
                    <p
                        className="mt-2 truncate text-xs"
                        style={{
                            color:
                                state.mutedTextColor,
                        }}
                    >
                        {status}
                    </p>
                )}

                {symbols && symbols.length > 0 && (
                    <div
                        className="mt-3 rounded-lg px-2.5 py-2 text-sm tracking-[0.2em]"
                        style={{
                            backgroundColor:
                                state.accentColor,
                            color: state.textColor,
                        }}
                    >
                        {symbols.join(" ")}
                    </div>
                )}

                {bio && (
                    <p
                        className="mt-3 whitespace-pre-wrap break-words text-xs leading-5"
                        style={{
                            color: state.textColor,
                        }}
                    >
                        {bio}
                    </p>
                )}

                <div className="mt-3 border-t border-white/[0.08] pt-3">
                    <p
                        className="mb-1.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                            color:
                                state.mutedTextColor,
                        }}
                    >
                        Palette
                    </p>

                    <div className="flex h-6 overflow-hidden rounded-md border border-white/[0.08]">
                        {state.palette.map(
                            (color, index) => (
                                <div
                                    key={`${color}-${index}`}
                                    title={color}
                                    className="flex-1"
                                    style={{
                                        backgroundColor:
                                            color,
                                    }}
                                />
                            )
                        )}
                    </div>
                </div>

                {state.incomplete && (
                    <p
                        className="mt-3 text-[10px]"
                        style={{
                            color:
                                state.mutedTextColor,
                        }}
                    >
                        Add at least two colours to finish
                        this palette.
                    </p>
                )}
            </div>
        </div>
    );
}
