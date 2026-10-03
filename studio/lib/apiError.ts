import {
    NextResponse,
} from "next/server";

/**
 * Client-safe error surface.
 *
 * Every route used to answer with `error.message`. That message is
 * often produced by `pg`, Discord, or Ollama and carries backend
 * hosts, database users, TLS details or raw upstream response bodies,
 * so any failing request doubled as a free description of the
 * infrastructure.
 *
 * `ExpectedError` is the only way a message reaches the browser:
 * throw it from a lib when the text was written for a person reading
 * the UI rather than for a log. Anything else is treated as
 * untrusted — logged in full, then replaced with a generic string and
 * an opaque id that can be matched against those logs.
 */
export class ExpectedError extends Error {
    readonly status: number | null;

    constructor(
        message: string,
        status: number | null = null
    ) {
        super(message);

        this.name = "ExpectedError";
        this.status = status;
    }
}

function newErrorId(): string {
    return crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 12);
}

function logError(
    errorId: string,
    error: unknown
) {
    const detail =
        error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);

    console.error(
        `[api ${errorId}] ${detail}`,

        error instanceof Error
            ? error.stack ?? ""
            : ""
    );
}

const GENERIC_MESSAGE =
    "Something went wrong. Please try again.";

/**
 * `fallbackStatus` and `fallbackMessage` keep the status and wording
 * a route already returned, so swapping the handler in does not
 * silently change the API contract.
 */
export function serializeRouteError(
    error: unknown,
    fallbackStatus = 500,
    fallbackMessage = GENERIC_MESSAGE
): {
    body: {
        error: string;
        errorId: string;
    };
    status: number;
} {
    if (error instanceof ExpectedError) {
        return {
            body: {
                error: error.message,
                errorId: newErrorId(),
            },

            status:
                error.status ?? fallbackStatus,
        };
    }

    const errorId = newErrorId();

    logError(errorId, error);

    return {
        body: {
            error: fallbackMessage,
            errorId,
        },

        status: fallbackStatus,
    };
}

export function handleRouteError(
    error: unknown,
    fallbackStatus = 500,
    fallbackMessage = GENERIC_MESSAGE
): NextResponse {
    const {
        body,
        status,
    } = serializeRouteError(
        error,
        fallbackStatus,
        fallbackMessage
    );

    return NextResponse.json(
        body,
        { status }
    );
}
