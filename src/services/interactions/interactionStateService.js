const crypto = require("crypto");

const STATE_TTL_MS = 5 * 60 * 1000;

const states = new Map();

function createState(data) {
    const id = crypto
        .randomBytes(6)
        .toString("hex");

    const now = Date.now();

    states.set(id, {
        id,
        data,
        createdAt: now,
        expiresAt: now + STATE_TTL_MS,
    });

    return id;
}

function getState(id) {
    const state = states.get(id);

    if (!state) {
        return null;
    }

    if (Date.now() >= state.expiresAt) {
        states.delete(id);
        return null;
    }

    return state;
}

function updateState(id, updates) {
    const state = getState(id);

    if (!state) {
        return null;
    }

    state.data = {
        ...state.data,
        ...updates,
    };

    states.set(id, state);

    return state;
}

function deleteState(id) {
    return states.delete(id);
}

function cleanupExpiredStates() {
    const now = Date.now();

    for (const [id, state] of states.entries()) {
        if (now >= state.expiresAt) {
            states.delete(id);
        }
    }
}

setInterval(
    cleanupExpiredStates,
    60 * 1000
).unref();

module.exports = {
    STATE_TTL_MS,
    createState,
    getState,
    updateState,
    deleteState,
    cleanupExpiredStates,
};