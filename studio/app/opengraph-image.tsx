import {
    ImageResponse,
} from "next/og";

import {
    SITE_URL,
} from "../lib/site";

/**
 * Default social card for the site.
 *
 * Generated rather than a checked-in PNG so the copy can never drift from the
 * landing page, and so it renders without any binary asset in the repo.
 *
 * satori (what `ImageResponse` renders through) supports a subset of flexbox
 * and no external CSS, so this is styled with inline styles only and uses the
 * system font stack — there is no font file to fetch at render time on a
 * Worker, and a missing font is the usual reason these images 500.
 */
export const alt =
    "Aesthetic King — build a complete Discord look, then bring it to your server";

export const size = {
    width: 1200,
    height: 630,
};

export const contentType =
    "image/png";

export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    padding: "72px",
                    background: "#08080c",
                    backgroundImage:
                        "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(139,92,246,0.35), transparent 70%)",
                    fontFamily:
                        "system-ui, sans-serif",
                    color: "#fff",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "20px",
                    }}
                >
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background:
                                "linear-gradient(135deg, #8b5cf6, #d946ef)",
                            fontSize: 30,
                            fontWeight: 700,
                        }}
                    >
                        AK
                    </div>

                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        <div
                            style={{
                                fontSize: 28,
                                fontWeight: 600,
                            }}
                        >
                            Aesthetic King
                        </div>

                        <div
                            style={{
                                fontSize: 18,
                                color: "#a1a1aa",
                            }}
                        >
                            Studio
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "24px",
                    }}
                >
                    <div
                        style={{
                            fontSize: 20,
                            fontWeight: 600,
                            letterSpacing: "0.2em",
                            textTransform:
                                "uppercase",
                            color: "#c4b5fd",
                        }}
                    >
                        Discord aesthetics, done
                    </div>

                    <div
                        style={{
                            fontSize: 62,
                            fontWeight: 700,
                            lineHeight: 1.15,
                            maxWidth: 980,
                        }}
                    >
                        Build a complete Discord look, then bring it to your
                        server
                    </div>

                    <div
                        style={{
                            fontSize: 26,
                            color: "#a1a1aa",
                            maxWidth: 900,
                            lineHeight: 1.5,
                        }}
                    >
                        Banner, avatar, colors, bio and status — designed
                        together, saved, and generated for your whole server.
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 22,
                        color: "#71717a",
                    }}
                >
                    <span>
                        {SITE_URL
                            ? SITE_URL.replace(
                                  /^https?:\/\//,
                                  ""
                              )
                            : "Aesthetic King Studio"}
                    </span>

                    <span>
                        Sign in with Discord
                    </span>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
