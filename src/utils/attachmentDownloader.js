const logger = require("./logger");

const DEFAULT_TIMEOUT_MS = 20_000;

class AttachmentDownloadError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = "AttachmentDownloadError";
        this.cause = cause;
    }
}

function attachmentSourceUrl(attachment) {
    return (
        attachment?.proxyURL ??
        attachment?.url ??
        attachment?.proxy_url ??
        null
    );
}

/**
 * Downloads a Discord attachment into a Buffer.
 *
 * discord.js 14.26 does not expose Attachment#fetch(), so the CDN URL is
 * fetched directly. Returns null when the file is larger than maxBytes so the
 * caller can report a size error instead of a download error.
 */
async function downloadAttachment(
    attachment,
    { maxBytes, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
    const url = attachmentSourceUrl(attachment);

    if (!url) {
        throw new AttachmentDownloadError(
            "The attachment did not include a downloadable URL."
        );
    }

    if (maxBytes && attachment.size && attachment.size > maxBytes) {
        return null;
    }

    let response;

    try {
        response = await fetch(url, {
            signal: AbortSignal.timeout(timeoutMs),
            redirect: "follow",
        });
    } catch (error) {
        logger.error(
            `Attachment download failed for ${attachment.name ?? url}`,
            error
        );

        throw new AttachmentDownloadError(
            error?.name === "TimeoutError"
                ? "That image took too long to download."
                : "The attachment could not be retrieved from Discord.",
            error
        );
    }

    if (!response.ok) {
        logger.error(
            `Attachment download returned HTTP ${response.status} for ${url}`
        );

        throw new AttachmentDownloadError(
            `Discord rejected the download (HTTP ${response.status}). ` +
                "The attachment may have expired — re-upload it and try again."
        );
    }

    const declared = Number(
        response.headers.get("content-length") ?? 0
    );

    if (maxBytes && declared && declared > maxBytes) {
        return null;
    }

    let buffer;

    try {
        buffer = Buffer.from(await response.arrayBuffer());
    } catch (error) {
        logger.error(
            `Attachment body could not be read for ${url}`,
            error
        );

        throw new AttachmentDownloadError(
            "The attachment came through incomplete. Try again.",
            error
        );
    }

    if (buffer.length === 0) {
        throw new AttachmentDownloadError(
            "The attachment downloaded as an empty file."
        );
    }

    if (maxBytes && buffer.length > maxBytes) {
        return null;
    }

    return buffer;
}

module.exports = {
    downloadAttachment,
    AttachmentDownloadError,
};
