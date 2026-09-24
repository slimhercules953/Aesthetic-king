const fs = require("fs");
const path = require("path");

const {
    getAesthetic,
} = require("../src/data/aesthetics");

const logger = require("../src/utils/logger");

const CATALOG_PATH = path.join(
    __dirname,
    "..",
    "src",
    "data",
    "assetCatalog.json"
);

const classifications = {
    "10": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["dreamy", "calm", "night"],
        colors: ["blue", "indigo"],
    },

    "11": {
        aesthetics: ["cyber", "dark"],
        moods: ["energetic", "dramatic"],
        colors: ["purple", "black"],
    },

    "118": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["dreamy", "calm"],
        colors: ["blue", "white"],
    },

    "12": {
        aesthetics: ["cyber", "dark"],
        moods: ["intense", "digital"],
        colors: ["purple", "black"],
    },

    "123": {
        aesthetics: ["minimalist", "dark"],
        moods: ["mysterious", "minimal"],
        colors: ["black", "white", "blue"],
    },

    "124": {
        aesthetics: ["anime", "cyber"],
        moods: ["energetic", "moody"],
        colors: ["blue", "black"],
    },

    "125": {
        aesthetics: ["minimalist", "dark"],
        moods: ["moody", "calm"],
        colors: ["blue", "black"],
    },

    "126": {
        aesthetics: ["minimalist", "dark"],
        moods: ["moody", "atmospheric"],
        colors: ["blue", "black"],
    },

    "127": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["dreamy", "soft"],
        colors: ["blue", "white"],
    },

    "129": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["dreamy", "calm"],
        colors: ["blue", "purple"],
    },

    "13": {
        aesthetics: ["anime", "dark"],
        moods: ["dramatic", "moody"],
        colors: ["purple", "black"],
    },

    "130": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["dreamy", "ethereal"],
        colors: ["blue", "white"],
    },

    "131": {
        aesthetics: ["dreamcore", "soft"],
        moods: ["dreamy", "ethereal"],
        colors: ["blue", "white"],
    },

    "132": {
        aesthetics: ["luxury", "romantic"],
        moods: ["elegant", "warm"],
        colors: ["black", "gold"],
    },

    "133": {
        aesthetics: ["luxury", "dark"],
        moods: ["elegant", "moody"],
        colors: ["black", "gold"],
    },

    "134": {
        aesthetics: ["luxury", "romantic"],
        moods: ["elegant", "soft"],
        colors: ["cream", "black", "gold"],
    },

    "136": {
        aesthetics: ["luxury", "romantic"],
        moods: ["elegant", "warm"],
        colors: ["brown", "gold"],
    },

    "137": {
        aesthetics: ["luxury", "dark"],
        moods: ["elegant", "moody"],
        colors: ["black", "gold", "brown"],
    },

    "138": {
        aesthetics: ["horror", "gothic", "dark"],
        moods: ["eerie", "macabre"],
        colors: ["green", "black"],
    },

    "139": {
        aesthetics: ["gothic", "romantic", "dark"],
        moods: ["dramatic", "romantic"],
        colors: ["red", "black"],
    },

    "14": {
        aesthetics: ["cyber", "dark"],
        moods: ["neon", "moody"],
        colors: ["purple", "black"],
    },

    "140": {
        aesthetics: ["dreamcore", "dark"],
        moods: ["dreamy", "moody"],
        colors: ["blue", "black"],
    },

    "141": {
        aesthetics: ["horror", "dark"],
        moods: ["eerie", "ominous"],
        colors: ["blue", "black", "white"],
    },

    "142": {
        aesthetics: ["horror", "dark"],
        moods: ["eerie", "minimal"],
        colors: ["black", "blue", "orange"],
    },

    "143": {
        aesthetics: ["horror", "dark"],
        moods: ["eerie", "ominous"],
        colors: ["black", "orange"],
    },

    "144": {
        aesthetics: ["horror", "dark"],
        moods: ["dramatic", "eerie"],
        colors: ["black", "red"],
    },

    "145": {
        aesthetics: ["horror", "grunge"],
        moods: ["chaotic", "nostalgic"],
        colors: ["orange", "brown", "black"],
    },

    "146": {
        aesthetics: ["horror", "dark"],
        moods: ["eerie", "dramatic"],
        colors: ["black", "white"],
    },

    "15": {
        aesthetics: ["anime", "monochrome"],
        moods: ["soft", "melancholic"],
        colors: ["white", "gray", "black"],
    },

    "16": {
        aesthetics: ["anime", "monochrome", "romantic"],
        moods: ["soft", "elegant"],
        colors: ["white", "gray", "black"],
    },

    "17": {
        aesthetics: ["anime", "monochrome", "dark"],
        moods: ["moody", "minimal"],
        colors: ["black", "white", "gray"],
    },

    "18": {
        aesthetics: ["monochrome", "dark"],
        moods: ["dramatic", "ethereal"],
        colors: ["black", "white"],
    },

    "19": {
        aesthetics: ["anime", "cyber"],
        moods: ["energetic", "dark"],
        colors: ["green", "black"],
    },

    "20": {
        aesthetics: ["anime", "nature"],
        moods: ["energetic", "bright"],
        colors: ["green", "yellow"],
    },

    "21": {
        aesthetics: ["nature", "dreamcore"],
        moods: ["peaceful", "dreamy"],
        colors: ["green", "cream"],
    },

    "22": {
        aesthetics: ["nature", "dark"],
        moods: ["mysterious", "atmospheric"],
        colors: ["green", "black"],
    },

    "23": {
        aesthetics: ["dark", "grunge"],
        moods: ["moody", "vintage"],
        colors: ["brown", "gray", "black"],
    },

    "24": {
        aesthetics: ["anime", "dark"],
        moods: ["moody", "calm"],
        colors: ["blue", "black"],
    },

    "25": {
        aesthetics: ["horror", "dark"],
        moods: ["eerie", "moody"],
        colors: ["green", "black", "white"],
    },

    "26": {
        aesthetics: ["nature", "dark"],
        moods: ["mysterious", "calm"],
        colors: ["green", "teal", "black"],
    },

    "27": {
        aesthetics: ["soft", "pastel", "nature"],
        moods: ["peaceful", "romantic"],
        colors: ["pink", "white"],
    },

    "28": {
        aesthetics: ["soft", "pastel", "nature"],
        moods: ["peaceful", "dreamy"],
        colors: ["pink", "white"],
    },

    "29": {
        aesthetics: ["romantic", "nature"],
        moods: ["elegant", "calm"],
        colors: ["red", "white", "black"],
    },

    "30": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["calm", "dreamy"],
        colors: ["blue", "white"],
    },

    "31": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["soft", "dreamy"],
        colors: ["blue", "white"],
    },

    "32": {
        aesthetics: ["cottagecore", "soft", "nature"],
        moods: ["gentle", "peaceful"],
        colors: ["cream", "green"],
    },

    "33": {
        aesthetics: ["romantic", "luxury"],
        moods: ["elegant", "classical"],
        colors: ["cream", "gold", "brown"],
    },

    "34": {
        aesthetics: ["dark", "monochrome"],
        moods: ["moody", "dramatic"],
        colors: ["black", "gray"],
    },

    "35": {
        aesthetics: ["anime", "dark", "minimalist"],
        moods: ["melancholic", "minimal"],
        colors: ["black", "white"],
    },

    "36": {
        aesthetics: ["anime", "dark", "minimalist"],
        moods: ["melancholic", "minimal"],
        colors: ["black", "white", "gold"],
    },

    "37": {
        aesthetics: ["romantic", "dreamcore"],
        moods: ["dreamy", "romantic"],
        colors: ["pink", "blue", "black"],
    },

    "38": {
        aesthetics: ["gothic", "dark", "romantic"],
        moods: ["dramatic", "intense"],
        colors: ["red", "black"],
    },

    "39": {
        aesthetics: ["anime", "dark"],
        moods: ["dramatic", "moody"],
        colors: ["red", "black", "gray"],
    },

    "40": {
        aesthetics: ["anime", "monochrome", "minimalist"],
        moods: ["minimal", "moody"],
        colors: ["black", "white"],
    },

    "41": {
        aesthetics: ["soft", "monochrome", "minimalist"],
        moods: ["gentle", "minimal"],
        colors: ["white", "gray", "brown"],
    },

    "42": {
        aesthetics: ["dreamcore", "soft"],
        moods: ["ethereal", "calm"],
        colors: ["white", "green", "gray"],
    },

    "43": {
        aesthetics: ["soft", "minimalist", "romantic"],
        moods: ["gentle", "elegant"],
        colors: ["cream", "white", "brown"],
    },

    "44": {
        aesthetics: ["anime", "dreamcore", "soft"],
        moods: ["dreamy", "bright"],
        colors: ["blue", "white"],
    },

    "45": {
        aesthetics: ["nature", "monochrome"],
        moods: ["calm", "wintery"],
        colors: ["gray", "white", "brown"],
    },

    "46": {
        aesthetics: ["dreamcore", "anime"],
        moods: ["dreamy", "calm"],
        colors: ["blue", "pink"],
    },

    "47": {
        aesthetics: ["anime", "dreamcore"],
        moods: ["dreamy", "night"],
        colors: ["blue", "black"],
    },

    "48": {
        aesthetics: ["minimalist", "monochrome"],
        moods: ["clean", "gentle"],
        colors: ["white", "gray", "black"],
    },

    "49": {
        aesthetics: ["grunge", "dark"],
        moods: ["chaotic", "mysterious"],
        colors: ["black", "white", "gray"],
    },

    "50": {
        aesthetics: ["dark", "grunge"],
        moods: ["moody", "cinematic"],
        colors: ["black", "brown", "gold"],
    },
};

function main() {
    const catalog = JSON.parse(
        fs.readFileSync(
            CATALOG_PATH,
            "utf8"
        )
    );

    const catalogIds = new Set(
        catalog.map((set) => set.id)
    );

    for (
        const [
            setId,
            classification,
        ] of Object.entries(
            classifications
        )
    ) {
        if (!catalogIds.has(setId)) {
            throw new Error(
                `Classification references unknown set ${setId}.`
            );
        }

        for (
            const aestheticId
            of classification.aesthetics
        ) {
            if (!getAesthetic(aestheticId)) {
                throw new Error(
                    `Unknown aesthetic "${aestheticId}" on set ${setId}.`
                );
            }
        }

        const set = catalog.find(
            (entry) => entry.id === setId
        );

        set.aesthetics =
            classification.aesthetics;

        set.moods =
            classification.moods;

        set.colors =
            classification.colors;
    }

    const unclassified =
        catalog.filter(
            (set) =>
                !set.aesthetics ||
                set.aesthetics.length === 0
        );

    fs.writeFileSync(
        CATALOG_PATH,
        `${JSON.stringify(
            catalog,
            null,
            2
        )}\n`
    );

    logger.success(
        `Classified ${Object.keys(classifications).length} profile sets.`
    );

    if (unclassified.length > 0) {
        logger.warn(
            `${unclassified.length} sets remain unclassified: ${unclassified
                .map((set) => set.id)
                .join(", ")}`
        );
    } else {
        logger.success(
            "Every profile set is classified."
        );
    }
}

try {
    main();
} catch (error) {
    logger.error(
        "Failed to seed asset classifications.",
        error
    );

    process.exit(1);
}