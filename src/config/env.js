require("dotenv").config();

const requiredVariables = [
    "TOKEN",
    "CLIENT_ID",
    "DEV_GUILD_ID",
];

const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
);

if (missingVariables.length > 0) {
    throw new Error(
        `Missing required environment variables: ${missingVariables.join(", ")}`
    );
}

const config = {
    environment: process.env.NODE_ENV || "development",

    discord: {
        token: process.env.TOKEN,
        clientId: process.env.CLIENT_ID,
        devGuildId: process.env.DEV_GUILD_ID,
    },

    r2: {
        accountId: process.env.R2_ACCOUNT_ID || null,
        accessKeyId: process.env.R2_ACCESS_KEY_ID || null,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || null,
        bucketName: process.env.R2_BUCKET_NAME || null,
        publicUrl: process.env.R2_PUBLIC_URL || null,
    },

    ai: {
        geminiApiKey: process.env.GEMINI_API_KEY || null,
    },
};

module.exports = config;