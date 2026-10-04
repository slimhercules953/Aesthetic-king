const {
    Client,
    Collection,
    GatewayIntentBits,
} = require("discord.js");

const config = require("./config/env");
const logger = require("./utils/logger");
const loadCommands = require("./loaders/commandLoader");
const loadEvents = require("./loaders/eventLoader");
const loadButtons = require("./loaders/buttonLoader");
const {
    disconnectDatabase,
} = require("./services/database/prisma");

/*
 * The bot only reads guild membership to decide whether a slash command or a
 * button press is allowed, and every piece of identity it renders comes from
 * its own database or from the interaction payload. Nothing in `src/` needs to
 * be told that a member joined, left or changed a role, so the privileged
 * Guild Members / Message Content intents stay off: fewer intents means a
 * smaller blast radius if the token leaks, and a simpler verification review.
 *
 * Adding an intent here is a real decision, not a config detail — Guild
 * Members and Message Content are privileged and must also be switched on in
 * the Discord developer portal. If a feature ever needs one, prefer reading the
 * member off the interaction (Discord sends it regardless) over subscribing to
 * the event stream.
 */
const INTENTS = [
    GatewayIntentBits.Guilds,
];

/**
 * Set once a teardown has begun so a second signal cannot start a second,
 * racing one.
 */
let shuttingDown = false;

/**
 * Hard ceiling on the teardown. Without it a hung `client.destroy()` — or a
 * database pool that never drains — keeps the process alive forever, which is
 * worse than the crash a supervisor would otherwise restart.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function shutdown(client, reason, exitCode = 0) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    logger.info(
        `Received ${reason}. Shutting down gracefully...`
    );

    const timer = setTimeout(() => {
        logger.error(
            "Shutdown timed out. Forcing exit."
        );

        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    /*
     * Unref'd so a fast, clean teardown can end the process without waiting on
     * a timer that is no longer needed.
     */
    timer.unref();

    try {
        /*
         * Disconnect first: it stops Discord routing new interactions to us, so
         * nothing arrives while the database is going away underneath it.
         */
        await client.destroy();

        logger.info(
            "Discord connection closed."
        );
    } catch (error) {
        logger.error(
            "Failed to close the Discord connection.",
            error
        );
    }

    try {
        await disconnectDatabase();

        logger.info(
            "Database pool closed."
        );
    } catch (error) {
        logger.error(
            "Failed to close the database pool.",
            error
        );
    }

    clearTimeout(timer);

    logger.info("Shutdown complete.");

    process.exit(exitCode);
}

function registerShutdownHandlers(client) {
    /*
     * SIGINT is Ctrl+C in a terminal; SIGTERM is what Docker, PM2 and most
     * supervisors send.
     */
    for (const signal of [
        "SIGINT",
        "SIGTERM",
    ]) {
        process.on(signal, () => {
            void shutdown(client, signal);
        });
    }

    /*
     * An unhandled rejection does NOT exit. Several call sites deliberately
     * fire analytics writes and state cleanup without awaiting them, and one
     * failing write should not take the bot down — but it has to be loud enough
     * to notice.
     */
    process.on(
        "unhandledRejection",
        (reason) => {
            logger.error(
                "Unhandled promise rejection.",
                reason instanceof Error
                    ? reason
                    : new Error(String(reason))
            );
        }
    );

    /*
     * An uncaught exception is different: a lock may never have been released
     * and a connection may be half-written, so this one does tear down. Exit
     * code 1 so a supervisor restarts the process.
     */
    process.on(
        "uncaughtException",
        (error) => {
            logger.error(
                "Uncaught exception — the process is in an unknown state.",
                error
            );

            void shutdown(
                client,
                "uncaughtException",
                1
            );
        }
    );
}

async function startBot() {
    const client = new Client({
        intents: INTENTS,
    });

    client.commands = new Collection();
    client.buttons = new Collection();

    try {
        logger.info(
            "Starting Aesthetic King V2..."
        );

        loadCommands(client);
        loadButtons(client);
        loadEvents(client);

        registerShutdownHandlers(client);

        await client.login(
            config.discord.token
        );
    } catch (error) {
        logger.error(
            "Aesthetic King V2 failed to start.",
            error
        );

        /*
         * Both are safe when the login never completed, and each releases its
         * resource if one *was* opened before the failure.
         */
        try {
            await client.destroy();
        } catch {
            /* nothing left to release */
        }

        try {
            await disconnectDatabase();
        } catch {
            /* nothing left to release */
        }

        process.exit(1);
    }
}

startBot();
