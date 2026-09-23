const { S3Client } = require("@aws-sdk/client-s3");

const config = require("../../config/env");

let r2Client = null;

function validateR2Config() {
    const missing = [];

    if (!config.r2.accountId) {
        missing.push("R2_ACCOUNT_ID");
    }

    if (!config.r2.accessKeyId) {
        missing.push("R2_ACCESS_KEY_ID");
    }

    if (!config.r2.secretAccessKey) {
        missing.push("R2_SECRET_ACCESS_KEY");
    }

    if (!config.r2.bucketName) {
        missing.push("R2_BUCKET_NAME");
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing required R2 configuration: ${missing.join(", ")}`
        );
    }
}

function getR2Client() {
    if (r2Client) {
        return r2Client;
    }

    validateR2Config();

    r2Client = new S3Client({
        region: "auto",

        endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,

        credentials: {
            accessKeyId: config.r2.accessKeyId,
            secretAccessKey: config.r2.secretAccessKey,
        },
    });

    return r2Client;
}

module.exports = {
    getR2Client,
    validateR2Config,
};