export type AestheticOption = {
    id: string;
    name: string;
};

export const AESTHETICS: AestheticOption[] = [
    {
        id: "gothic",
        name: "Gothic",
    },
    {
        id: "nature",
        name: "Nature",
    },
    {
        id: "luxury",
        name: "Luxury",
    },
    {
        id: "kawaii",
        name: "Kawaii",
    },
    {
        id: "pastel",
        name: "Pastel",
    },
    {
        id: "dreamcore",
        name: "Dreamcore",
    },
    {
        id: "cyber",
        name: "Cyber",
    },
    {
        id: "vaporwave",
        name: "Vaporwave",
    },
    {
        id: "cottagecore",
        name: "Cottagecore",
    },
    {
        id: "y2k",
        name: "Y2K",
    },
    {
        id: "romantic",
        name: "Romantic",
    },
    {
        id: "anime",
        name: "Anime",
    },
];

export function getAestheticOption(
    id: string | null | undefined
): AestheticOption | null {
    if (!id) {
        return null;
    }

    const normalizedId =
        id.trim().toLowerCase();

    return (
        AESTHETICS.find(
            (aesthetic) =>
                aesthetic.id ===
                normalizedId
        ) ?? null
    );
}

export function isValidAestheticId(
    id: string
): boolean {
    return (
        getAestheticOption(id) !==
        null
    );
}