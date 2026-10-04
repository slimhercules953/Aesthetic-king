import {
    dashboardMetadata,
} from "../../../lib/pageMetadata";

﻿import ImageToAestheticStudio from "../../../components/image-to-aesthetic/ImageToAestheticStudio";

export const metadata =
    dashboardMetadata(
        "Image to Aesthetic",
        "Upload any image and get a Discord profile built from its colours."
    );

export default function ImageToAestheticPage() {
    const r2PublicUrl = process.env.R2_PUBLIC_URL;

    if (!r2PublicUrl) {
        throw new Error(
            "R2_PUBLIC_URL is not configured."
        );
    }

    return (
        <>
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                    Aesthetic Studio
                </p>

                <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                    Image to Aesthetic
                </h1>

                <p className="mt-3 max-w-3xl text-zinc-500">
                    Drop in any picture - a screenshot, a sunset, an anime still - and Aesthetic King reads the palette, names the aesthetic, and builds a matching Discord profile around it.
                </p>
            </div>

            <div className="mt-8">
                <ImageToAestheticStudio
                    r2PublicUrl={r2PublicUrl}
                />
            </div>
        </>
    );
}
