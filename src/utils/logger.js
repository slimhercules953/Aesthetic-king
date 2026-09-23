function timestamp() {
    return new Date().toISOString();
}

function log(level, message) {
    console.log(`[${timestamp()}] [${level}] ${message}`);
}

module.exports = {
    info(message) {
        log("INFO", message);
    },

    success(message) {
        log("SUCCESS", message);
    },

    warn(message) {
        console.warn(`[${timestamp()}] [WARN] ${message}`);
    },

    error(message, error = null) {
        console.error(`[${timestamp()}] [ERROR] ${message}`);

        if (error) {
            console.error(error);
        }
    },
};