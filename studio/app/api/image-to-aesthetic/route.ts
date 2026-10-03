import { NextRequest, NextResponse } from "next/server";

import { handleRouteError } from "../../../lib/apiError";
import { requireFeature } from "../../../lib/gate";
import { getFeatureAccess } from "../../../lib/featureAccess";
import { recordUsage, refundUsage } from "../../../lib/usage";
import { FEATURES } from "../../../lib/features";
import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";
import { readImagePalette } from "../../../lib/imageReader";

async function getSession(request: NextRequest) {
    const cookie = request.cookies.get(
        SESSION_COOKIE_NAME
    );

    if (!cookie) {
        return null;
    }

    return verifySessionToken(cookie.value);
}

/**
 * Reads an uploaded image into an aesthetic.
 *
 * The browser does the pixel work and posts the sampled hex list, so
 * nothing here touches image bytes. Two limits apply: the gated
 * Image-to-Aesthetic feature decides whether the tool is open at all,
 * and the metered AI allowance pays for the model call.
 */
export async function POST(request: NextRequest) {
    const session = await getSession(request);

    if (!session) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const body = (await request.json().catch(() => null)) as {
        palette?: unknown;
        request?: string;
    } | null;

    if (!Array.isArray(body?.palette)) {
        return NextResponse.json(
            {
                error:
                    "A sampled palette is required. Upload an image and try again.",
            },
            { status: 400 }
        );
    }

    const feature = await requireFeature(
        session.discordId,
        "IMAGE_TO_AESTHETIC"
    );

    if (!feature.allowed) {
        return feature.response;
    }

    const generation = await requireFeature(
        session.discordId,
        "AI_GENERATION_LIMIT"
    );

    if (!generation.allowed) {
        return generation.response;
    }

    const usageOptions = {
        usageSource: FEATURES.AI_GENERATION_LIMIT.usageSource,
        resetPeriod: generation.access.resetPeriod,
    } as const;

    await recordUsage(
        session.discordId,
        "AI_GENERATION_LIMIT",
        usageOptions
    );

    try {
        const assets = await getFeatureAccess(
            session.discordId,
            "PREMIUM_ASSETS"
        );

        const reading = await readImagePalette({
            palette: body.palette as string[],
            request: body.request ?? null,
            premiumUnlocked: assets.allowed,
        });

        return NextResponse.json({ reading });
    } catch (error) {
        await refundUsage(
            session.discordId,
            "AI_GENERATION_LIMIT",
            usageOptions
        );

        return handleRouteError(
            error,
            500,
            "Unable to read that image."
        );
    }
}
