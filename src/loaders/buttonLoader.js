const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

function getButtonFiles(directory) {
    const entries = fs.readdirSync(directory, {
        withFileTypes: true,
    });

    const files = [];

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            files.push(...getButtonFiles(fullPath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }

    return files;
}

function loadButtons(client) {
    const buttonsDirectory = path.join(
        __dirname,
        "..",
        "components",
        "buttons"
    );

    const buttonFiles = getButtonFiles(
        buttonsDirectory
    );

    for (const filePath of buttonFiles) {
        const button = require(filePath);

        if (
            !button.customId ||
            typeof button.execute !== "function"
        ) {
            logger.warn(
                `Skipping invalid button file: ${filePath}`
            );
            continue;
        }

        if (client.buttons.has(button.customId)) {
            throw new Error(
                `Duplicate button handler detected: ${button.customId}`
            );
        }

        client.buttons.set(
            button.customId,
            button
        );

        logger.info(
            `Loaded button: ${button.customId}`
        );
    }
}

module.exports = loadButtons;