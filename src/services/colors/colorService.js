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

function detectMimeTypeFromBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        return null;
    }

    // JPEG
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return "image/jpeg";
    }

    // PNG
    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return "image/png";
    }

    // WebP
    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }

    return null;
}

async function extractColors(
    imageBuffer,
    mimeType = null
) {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new TypeError(
            "extractColors requires an image Buffer."
        );
    }

    const detectedMimeType =
        detectMimeTypeFromBuffer(imageBuffer);

    const normalizedMimeType =
        detectedMimeType ||
        normalizeMimeType(mimeType);

    if (
        !normalizedMimeType ||
        !SUPPORTED_MIME_TYPES.has(
            normalizedMimeType
        )
    ) {
        throw new Error(
            `Unsupported or unknown image type: ${
                normalizedMimeType ||
                mimeType ||
                "unknown"
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
        detectMimeTypeFromBuffer(
            asset.buffer
        ) ||
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
    detectMimeTypeFromBuffer,
};