const {
    ListObjectsV2Command,
    GetObjectCommand,
} = require("@aws-sdk/client-s3");

const config = require("../../config/env");

const {
    getR2Client,
} = require("./r2Client");

const ASSET_PATTERN =
    /^(.+?)\s+(pfp|banner)\.(jpg|jpeg|png|webp)$/i;

const ASSET_CACHE_TTL_MS =
    10 * 60 * 1000;

let objectCache = null;
let objectCacheCreatedAt = 0;

function parseAssetKey(key) {
    if (!key) {
        return null;
    }

    const match =
        key.match(
            ASSET_PATTERN
        );

    if (!match) {
        return null;
    }

    return {
        setId:
            match[1].trim(),

        type:
            match[2].toLowerCase(),

        extension:
            match[3].toLowerCase(),

        key,
    };
}

function buildPublicUrl(key) {
    if (!config.r2.publicUrl) {
        return null;
    }

    const baseUrl =
        config.r2.publicUrl.replace(
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

    return `${baseUrl}/${encodedKey}`;
}

function isAssetCacheValid() {
    if (!objectCache) {
        return false;
    }

    const age =
        Date.now() -
        objectCacheCreatedAt;

    return (
        age <
        ASSET_CACHE_TTL_MS
    );
}

function invalidateAssetCache() {
    objectCache = null;
    objectCacheCreatedAt = 0;
}

function getAssetCacheInfo() {
    if (!objectCache) {
        return {
            cached: false,
            objectCount: 0,
            ageMs: null,
            expiresInMs: null,
        };
    }

    const ageMs =
        Date.now() -
        objectCacheCreatedAt;

    return {
        cached: true,

        objectCount:
            objectCache.length,

        ageMs,

        expiresInMs:
            Math.max(
                ASSET_CACHE_TTL_MS -
                    ageMs,
                0
            ),
    };
}

async function fetchAssetObjectsFromR2() {
    const client =
        getR2Client();

    const objects = [];

    let continuationToken;

    do {
        const response =
            await client.send(
                new ListObjectsV2Command({
                    Bucket:
                        config.r2
                            .bucketName,

                    ContinuationToken:
                        continuationToken,
                })
            );

        if (response.Contents) {
            objects.push(
                ...response.Contents
            );
        }

        continuationToken =
            response.IsTruncated
                ? response
                      .NextContinuationToken
                : undefined;
    } while (
        continuationToken
    );

    return objects;
}

async function listAssetObjects({
    forceRefresh = false,
} = {}) {
    if (
        !forceRefresh &&
        isAssetCacheValid()
    ) {
        return objectCache;
    }

    const objects =
        await fetchAssetObjectsFromR2();

    objectCache = objects;
    objectCacheCreatedAt =
        Date.now();

    return objectCache;
}

async function refreshAssetCache() {
    return listAssetObjects({
        forceRefresh: true,
    });
}

async function getProfileSets() {
    const objects =
        await listAssetObjects();

    const sets =
        new Map();

    for (
        const object
        of objects
    ) {
        const asset =
            parseAssetKey(
                object.Key
            );

        if (!asset) {
            continue;
        }

        if (
            !sets.has(
                asset.setId
            )
        ) {
            sets.set(
                asset.setId,
                {
                    id:
                        asset.setId,

                    pfp: null,
                    banner: null,
                }
            );
        }

        const profileSet =
            sets.get(
                asset.setId
            );

        profileSet[
            asset.type
        ] = {
            key:
                asset.key,

            extension:
                asset.extension,

            url:
                buildPublicUrl(
                    asset.key
                ),
        };
    }

    return Array.from(
        sets.values()
    );
}

async function getCompleteProfileSets() {
    const sets =
        await getProfileSets();

    return sets.filter(
        (set) =>
            set.pfp &&
            set.banner
    );
}

async function getRandomProfileSet(
    excludeSetId = null
) {
    const sets =
        await getCompleteProfileSets();

    if (
        sets.length === 0
    ) {
        throw new Error(
            "No complete PFP/banner sets were found in R2."
        );
    }

    let availableSets =
        sets;

    if (
        excludeSetId &&
        sets.length > 1
    ) {
        availableSets =
            sets.filter(
                (set) =>
                    set.id !==
                    excludeSetId
            );
    }

    const randomIndex =
        Math.floor(
            Math.random() *
                availableSets.length
        );

    return availableSets[
        randomIndex
    ];
}

async function getAssetBuffer(
    key
) {
    if (!key) {
        throw new Error(
            "An R2 object key is required."
        );
    }

    const client =
        getR2Client();

    const response =
        await client.send(
            new GetObjectCommand({
                Bucket:
                    config.r2
                        .bucketName,

                Key:
                    key,
            })
        );

    if (!response.Body) {
        throw new Error(
            `R2 returned an empty body for: ${key}`
        );
    }

    const chunks = [];

    for await (
        const chunk
        of response.Body
    ) {
        chunks.push(
            chunk
        );
    }

    return Buffer.concat(
        chunks
    );
}

module.exports = {
    parseAssetKey,
    buildPublicUrl,

    listAssetObjects,
    refreshAssetCache,
    invalidateAssetCache,
    getAssetCacheInfo,

    getProfileSets,
    getCompleteProfileSets,
    getRandomProfileSet,

    getAssetBuffer,

    ASSET_CACHE_TTL_MS,
};