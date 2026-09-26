const {
    PrismaClient,
} = require("@prisma/client");

const logger =
    require("../../utils/logger");

let prisma;

if (
    global.aestheticKingPrisma
) {
    prisma =
        global.aestheticKingPrisma;
} else {
    prisma =
        new PrismaClient();

    if (
        process.env.NODE_ENV !==
        "production"
    ) {
        global.aestheticKingPrisma =
            prisma;
    }
}

async function connectDatabase() {
    try {
        await prisma.$connect();

        logger.success(
            "Connected to PostgreSQL."
        );

        return prisma;
    } catch (error) {
        logger.error(
            "Failed to connect to PostgreSQL.",
            error
        );

        throw error;
    }
}

async function disconnectDatabase() {
    await prisma.$disconnect();
}

module.exports = {
    prisma,
    connectDatabase,
    disconnectDatabase,
};