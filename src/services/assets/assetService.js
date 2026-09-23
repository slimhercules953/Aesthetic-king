const {
    ListObjectsV2Command,
    GetObjectCommand,
} = require("@aws-sdk/client-s3");

const config = require("../../config/env");
const { getR2Client } = require("./r2Client");

const ASSET_PATTERN =
    /^(.+?)\s+(pfp|banner)\.(jpg|jpeg|png|webp)$/i;

function parseAssetKey(key) {
    if (!key) {
        return null;
    }

    const match = key.match(ASSET_PATTERN);

    if (!match) {
        return null;
    }

    return {
        setId: match[1].trim(),
        type: match[2].toLowerCase(),
        extension: match[3].toLowerCase(),
        key,
    };
}

function buildPublicUrl(key) {
    if (!config.r2.publicUrl) {
        return null;
    }

    const baseUrl =
        config.r2.publicUrl.replace(/\/+$/, "");

    const encodedKey = key
        .split("/")
        .map(encodeURIComponent)
        .join("/");

    return `${baseUrl}/${encodedKey}`;
}

async function listAssetObjects() {
    const client = getR2Client();

    const objects = [];
    let continuationToken;

    do {
        const response = await client.send(
            new ListObjectsV2Command({
                Bucket: config.r2.bucketName,
                ContinuationToken: continuationToken,
            })
        );

        if (response.Contents) {
            objects.push(...response.Contents);
        }

        continuationToken =
            response.IsTruncated
                ? response.NextContinuationToken
                : undefined;
    } while (continuationToken);

    return objects;
}

async function getProfileSets() {
    const objects = await listAssetObjects();

    const sets = new Map();

    for (const object of objects) {
        const asset = parseAssetKey(object.Key);

        if (!asset) {
            continue;
        }

        if (!sets.has(asset.setId)) {
            sets.set(asset.setId, {
                id: asset.setId,
                pfp: null,
                banner: null,
            });
        }

        const profileSet = sets.get(asset.setId);

        profileSet[asset.type] = {
            key: asset.key,
            extension: asset.extension,
            url: buildPublicUrl(asset.key),
        };
    }

    return Array.from(sets.values());
}

async function getCompleteProfileSets() {
    const sets = await getProfileSets();

    return sets.filter(
        (set) => set.pfp && set.banner
    );
}

async function getRandomProfileSet(excludeSetId = null) {
    const sets = await getCompleteProfileSets();

    if (sets.length === 0) {
        throw new Error(
            "No complete PFP/banner sets were found in R2."
        );
    }

    let availableSets = sets;

    if (excludeSetId && sets.length > 1) {
        availableSets = sets.filter(
            (set) => set.id !== excludeSetId
        );
    }

    const randomIndex = Math.floor(
        Math.random() * availableSets.length
    );

    return availableSets[randomIndex];
}

async function getAssetBuffer(key) {
    if (!key) {
        throw new Error(
            "An R2 object key is required."
        );
    }

    const client = getR2Client();

    const response = await client.send(
        new GetObjectCommand({
            Bucket: config.r2.bucketName,
            Key: key,
        })
    );

    if (!response.Body) {
        throw new Error(
            `R2 returned an empty body for: ${key}`
        );
    }

    const chunks = [];

    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }

    return Buffer.concat(chunks);
}

module.exports = {
    parseAssetKey,
    buildPublicUrl,
    listAssetObjects,
    getProfileSets,
    getCompleteProfileSets,
    getRandomProfileSet,
    getAssetBuffer,
};