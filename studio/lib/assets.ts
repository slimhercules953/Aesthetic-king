import assetCatalog from "../../src/data/assetCatalog.json";

type CatalogEntry = {
    id: string;

    assets?: {
        pfp?: string;
        banner?: string;
    };

    enabled?: boolean;
};

export type ProfileAssets = {
    setId: string;
    pfpUrl: string;
    bannerUrl: string;
};

function buildAssetUrl(
    key: string
) {
    const publicUrl =
        process.env.R2_PUBLIC_URL;

    if (!publicUrl) {
        throw new Error(
            "R2_PUBLIC_URL is not configured."
        );
    }

    const base =
        publicUrl.replace(
            /\/+$/,
            ""
        );

    const encodedKey =
        key
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/");

    return `${base}/${encodedKey}`;
}

export function getProfileAssets(
    setId: string | null
): ProfileAssets | null {
    if (!setId) {
        return null;
    }

    const entry =
        (
            assetCatalog as CatalogEntry[]
        ).find(
            (item) =>
                item.id === setId
        );

    if (
        !entry ||
        entry.enabled === false ||
        !entry.assets?.pfp ||
        !entry.assets?.banner
    ) {
        return null;
    }

    return {
        setId,

        pfpUrl:
            buildAssetUrl(
                entry.assets.pfp
            ),

        bannerUrl:
            buildAssetUrl(
                entry.assets.banner
            ),
    };
}