import CreateAestheticStudio from "../../../components/create/CreateAestheticStudio";

import {
    getAssetCatalogFilters,
    getAssetSets,
} from "../../../lib/assetCatalog";

export default function CreatePage() {
    const filters =
        getAssetCatalogFilters();

    const assetSets =
        getAssetSets();

    const r2PublicUrl =
        process.env.R2_PUBLIC_URL;

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
                    Create Aesthetic
                </h1>

                <p className="mt-3 max-w-3xl text-zinc-500">
                    Build a complete matching Discord profile with AI-generated identity, colors, symbols, and a curated Aesthetic King profile set.
                </p>
            </div>

            <div className="mt-8">
                <CreateAestheticStudio
                    filters={
                        filters
                    }
                    assetSets={
                        assetSets
                    }
                    r2PublicUrl={
                        r2PublicUrl
                    }
                />
            </div>
        </>
    );
}