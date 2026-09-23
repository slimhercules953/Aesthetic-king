const getColors = require("get-image-colors");

const SUPPORTED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

function normalizeMimeType(mimeType) {
    if (!mimeType) {
        return null;
    }

    const normalized = mimeType
        .toLowerCase()
        .trim();

    if (normalized === "image/jpg") {
        return "image/jpeg";
    }

    return normalized;
}

function getMimeTypeFromExtension(extension) {
    if (!extension) {
        return null;
    }

    switch (
    extension
        .toLowerCase()
        .replace(".", "")
    ) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";

        case "png":
            return "image/png";

        case "webp":
            return "image/webp";

        default:
            return null;
    }
}

async function extractColors(
    imageBuffer,
    mimeType
) {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new TypeError(
            "extractColors requires an image Buffer."
        );
    }

    const normalizedMimeType =
        normalizeMimeType(mimeType);

    if (
        !normalizedMimeType ||
        !SUPPORTED_MIME_TYPES.has(
            normalizedMimeType
        )
    ) {
        throw new Error(
            `Unsupported image type: ${mimeType || "unknown"
            }`
        );
    }

    const colors = await getColors(
        imageBuffer,
        normalizedMimeType
    );

    if (!colors || colors.length === 0) {
        throw new Error(
            "No colors could be extracted from the image."
        );
    }

    return colors.map((color) => {
        const [r, g, b] = color.rgb();

        return {
            hex: color.hex().toUpperCase(),
            rgb: {
                r,
                g,
                b,
            },
        };
    });
}

async function extractColorsFromAsset(asset) {
    if (!asset) {
        throw new Error(
            "An asset is required for color extraction."
        );
    }

    if (!asset.buffer) {
        throw new Error(
            "The asset must contain an image buffer."
        );
    }

    const mimeType =
        asset.mimeType ||
        getMimeTypeFromExtension(
            asset.extension
        );

    return extractColors(
        asset.buffer,
        mimeType
    );
}

module.exports = {
    extractColors,
    extractColorsFromAsset,
    getMimeTypeFromExtension,
};