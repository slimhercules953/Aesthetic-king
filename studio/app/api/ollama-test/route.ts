import {
    NextResponse,
} from "next/server";

import {
    generateOllamaText,
} from "../../../lib/ollama";

export async function GET() {
    try {
        const response =
            await generateOllamaText(
                "Reply with exactly: Aesthetic King Studio connected successfully."
            );

        return NextResponse.json({
            success: true,
            response,
        });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,

                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown Ollama error.",
            },
            {
                status: 500,
            }
        );
    }
}