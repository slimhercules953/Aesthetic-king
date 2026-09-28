export function getR2AssetUrl(
    baseUrl: string,
    key: string
) {
    const normalizedBaseUrl =
        baseUrl.replace(
            /\/+$/,
            ""
        );

    const encodedKey =
        key
            .split("/")
            .map((part) =>
                encodeURIComponent(
                    part
                )
            )
            .join("/");

    return `${normalizedBaseUrl}/${encodedKey}`;
}