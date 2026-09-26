const {
    prisma,
} = require("./prisma");

function validateSavedAestheticInput({
    userId,
    name,
    aestheticId,
}) {
    if (!userId) {
        throw new Error(
            "A database user ID is required."
        );
    }

    if (
        !name ||
        !name.trim()
    ) {
        throw new Error(
            "A saved aesthetic name is required."
        );
    }

    if (!aestheticId) {
        throw new Error(
            "An aesthetic ID is required."
        );
    }
}

async function createSavedAesthetic({
    userId,
    generationId = null,
    name,
    aestheticId,
    moodId = null,
    colorFilter = null,
    profileSetId = null,
    usernameIdea = null,
    bio = null,
    status = null,
    symbols = [],
    palette = [],
}) {
    validateSavedAestheticInput({
        userId,
        name,
        aestheticId,
    });

    return prisma.savedAesthetic.create({
        data: {
            userId,
            generationId,

            name:
                name.trim(),

            aestheticId,
            moodId,
            colorFilter,
            profileSetId,

            usernameIdea,
            bio,
            status,

            symbols:
                Array.isArray(symbols)
                    ? symbols
                    : [],

            palette:
                Array.isArray(palette)
                    ? palette
                    : [],
        },
    });
}

async function getSavedAestheticByGenerationId(
    generationId
) {
    if (!generationId) {
        return null;
    }

    return prisma.savedAesthetic.findUnique({
        where: {
            generationId,
        },
    });
}

async function getSavedAesthetic(
    id
) {
    if (!id) {
        throw new Error(
            "A saved aesthetic ID is required."
        );
    }

    return prisma.savedAesthetic.findUnique({
        where: {
            id,
        },
    });
}

async function getUserSavedAesthetics(
    userId
) {
    if (!userId) {
        throw new Error(
            "A database user ID is required."
        );
    }

    return prisma.savedAesthetic.findMany({
        where: {
            userId,
        },

        orderBy: {
            updatedAt:
                "desc",
        },
    });
}

async function updateSavedAesthetic(
    id,
    userId,
    updates
) {
    if (!id) {
        throw new Error(
            "A saved aesthetic ID is required."
        );
    }

    if (!userId) {
        throw new Error(
            "A database user ID is required."
        );
    }

    const existing =
        await prisma.savedAesthetic.findFirst({
            where: {
                id,
                userId,
            },
        });

    if (!existing) {
        return null;
    }

    const allowedUpdates = {};

    const allowedFields = [
        "name",
        "aestheticId",
        "moodId",
        "colorFilter",
        "profileSetId",
        "usernameIdea",
        "bio",
        "status",
        "symbols",
        "palette",
    ];

    for (
        const field
        of allowedFields
    ) {
        if (
            Object.prototype.hasOwnProperty.call(
                updates,
                field
            )
        ) {
            allowedUpdates[field] =
                updates[field];
        }
    }

    if (
        typeof allowedUpdates.name ===
        "string"
    ) {
        allowedUpdates.name =
            allowedUpdates.name.trim();
    }

    return prisma.savedAesthetic.update({
        where: {
            id,
        },

        data:
            allowedUpdates,
    });
}

async function deleteSavedAesthetic(
    id,
    userId
) {
    if (!id) {
        throw new Error(
            "A saved aesthetic ID is required."
        );
    }

    if (!userId) {
        throw new Error(
            "A database user ID is required."
        );
    }

    const existing =
        await prisma.savedAesthetic.findFirst({
            where: {
                id,
                userId,
            },
        });

    if (!existing) {
        return false;
    }

    await prisma.savedAesthetic.delete({
        where: {
            id,
        },
    });

    return true;
}

async function countUserSavedAesthetics(
    userId
) {
    if (!userId) {
        throw new Error(
            "A database user ID is required."
        );
    }

    return prisma.savedAesthetic.count({
        where: {
            userId,
        },
    });
}

module.exports = {
    createSavedAesthetic,
    getSavedAesthetic,
    getSavedAestheticByGenerationId,
    getUserSavedAesthetics,
    updateSavedAesthetic,
    deleteSavedAesthetic,
    countUserSavedAesthetics,
};