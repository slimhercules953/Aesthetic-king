import {
    dashboardMetadata,
} from "../../../lib/pageMetadata";

import {
    cookies,
} from "next/headers";

import {
    Crown,
    Images,
    Layers,
    Palette,
    Share2,
    UserRound,
} from "lucide-react";

import DangerZone from "../../../components/dashboard/DangerZone";
import LogoutButton from "../../../components/dashboard/LogoutButton";

import {
    getAccountDetails,
} from "../../../lib/account";

import {
    getCrownBalance,
} from "../../../lib/crowns";

import {
    getEntitlementSummary,
} from "../../../lib/entitlements";

import {
    SESSION_COOKIE_NAME,
    verifySessionToken,
} from "../../../lib/session";

function formatDateTime(
    value: Date | null
): string {
    if (!value) {
        return "Unknown";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(value);
}

function avatarUrl(
    discordId: string,
    avatarHash: string | null
): string | null {
    if (!avatarHash) {
        return null;
    }

    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?size=128`;
}

function DetailRow({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-3 last:border-b-0">
            <span className="text-sm text-zinc-500">
                {label}
            </span>

            <span className="text-right text-sm font-medium text-zinc-200">
                {value}
            </span>
        </div>
    );
}

function CountCard({
    icon,
    label,
    value,
    href,
}: {
    icon: React.ReactNode;
    label: string;
    value: number;
    href: string;
}) {
    return (
        <a
            href={href}
            className="rounded-2xl border border-white/[0.06] bg-[#101015] p-4 transition hover:border-violet-500/30 hover:bg-white/[0.03]"
        >
            <span className="flex items-center gap-2 text-zinc-500">
                {icon}

                <span className="text-xs font-medium uppercase tracking-wider">
                    {label}
                </span>
            </span>

            <p className="mt-2 text-2xl font-bold text-zinc-100">
                {value}
            </p>
        </a>
    );
}

export const metadata =
    dashboardMetadata(
        "Settings",
        "Your account, what Aesthetic King stores about you, and how to delete it."
    );

export default async function SettingsPage() {
    const cookieStore =
        await cookies();

    const sessionCookie =
        cookieStore.get(
            SESSION_COOKIE_NAME
        );

    if (!sessionCookie) {
        return null;
    }

    const session =
        await verifySessionToken(
            sessionCookie.value
        );

    if (!session) {
        return null;
    }

    const [account, entitlements, crowns] =
        await Promise.all([
            getAccountDetails(
                session.discordId
            ),
            getEntitlementSummary(
                session.discordId
            ),
            getCrownBalance(
                session.discordId
            ),
        ]);

    if (!account) {
        return null;
    }

    const username =
        account.user.username ??
        session.username;

    const image = avatarUrl(
        account.user.discordId,
        account.user.avatarHash
    );

    const isPremium =
        entitlements.plan === "PREMIUM";

    return (
        <>
            <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">
                Account
            </p>

            <h2 className="mt-3 text-4xl font-bold">
                Account settings
            </h2>

            <p className="mt-3 text-zinc-400">
                Your identity, plan and content on Aesthetic King Studio.
            </p>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                    <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <h3 className="text-sm font-semibold text-zinc-200">
                            Discord identity
                        </h3>

                        <div className="mt-5 flex items-center gap-4">
                            {image ? (
                                <img
                                    src={image}
                                    alt=""
                                    className="h-16 w-16 rounded-full border border-white/[0.08]"
                                />
                            ) : (
                                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xl font-semibold text-white">
                                    {username
                                        .charAt(0)
                                        .toUpperCase()}
                                </span>
                            )}

                            <div className="min-w-0">
                                <p className="truncate text-lg font-semibold text-zinc-100">
                                    {
                                        account.user
                                            .displayName ??
                                        username
                                    }
                                </p>

                                <p className="truncate text-sm text-zinc-500">
                                    @{username}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5">
                            <DetailRow
                                label="Discord ID"
                                value={
                                    <span className="font-mono text-xs">
                                        {
                                            account.user
                                                .discordId
                                        }
                                    </span>
                                }
                            />

                            <DetailRow
                                label="Member since"
                                value={formatDateTime(
                                    account.createdAt
                                )}
                            />

                            <DetailRow
                                label="Discord connection"
                                value={
                                    account.hasDiscordConnection
                                        ? "Connected"
                                        : "Not connected"
                                }
                            />
                        </div>

                        <p className="mt-4 text-xs leading-6 text-zinc-600">
                            Your name and avatar are read from Discord
                            each time you sign in, so change them there
                            and they will match next time you log in.
                        </p>
                    </section>

                    <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <h3 className="text-sm font-semibold text-zinc-200">
                            Your content
                        </h3>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <CountCard
                                icon={
                                    <Images size={14} />
                                }
                                label="Aesthetics"
                                value={
                                    account.counts
                                        .aesthetics
                                }
                                href="/dashboard/aesthetics"
                            />

                            <CountCard
                                icon={
                                    <Palette size={14} />
                                }
                                label="Palettes"
                                value={
                                    account.counts.palettes
                                }
                                href="/dashboard/palettes"
                            />

                            <CountCard
                                icon={
                                    <UserRound size={14} />
                                }
                                label="Profiles"
                                value={
                                    account.counts.profiles
                                }
                                href="/dashboard/profile"
                            />

                            <CountCard
                                icon={
                                    <Layers size={14} />
                                }
                                label="Collections"
                                value={
                                    account.counts
                                        .collections
                                }
                                href="/dashboard/collections"
                            />

                            <CountCard
                                icon={
                                    <Share2 size={14} />
                                }
                                label="Shared posts"
                                value={
                                    account.counts.shared
                                }
                                href="/dashboard/discover"
                            />
                        </div>
                    </section>

                    <DangerZone
                        username={username}
                    />
                </div>

                <div className="space-y-6">
                    <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-zinc-200">
                                Plan
                            </h3>

                            <span
                                className={[
                                    "rounded-full px-3 py-1 text-xs font-semibold",
                                    isPremium
                                        ? "bg-violet-500/15 text-violet-300"
                                        : "bg-white/[0.05] text-zinc-400",
                                ].join(" ")}
                            >
                                {entitlements.plan}
                            </span>
                        </div>

                        <div className="mt-4">
                            <DetailRow
                                label="Renews or ends"
                                value={
                                    isPremium
                                        ? entitlements.renewsAt
                                            ? formatDateTime(
                                                entitlements.renewsAt
                                            )
                                            : "Never"
                                        : "—"
                                }
                            />

                            <DetailRow
                                label="How you got it"
                                value={
                                    isPremium
                                        ? entitlements.isPromotional
                                            ? "Granted"
                                            : "Subscription"
                                        : "Free plan"
                                }
                            />
                        </div>

                        <a
                            href="/dashboard/premium"
                            className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-300 transition hover:border-violet-500/40 hover:bg-violet-500/15"
                        >
                            <Crown size={15} />

                            {isPremium
                                ? "Manage Premium"
                                : "See Premium plans"}
                        </a>
                    </section>

                    <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <h3 className="text-sm font-semibold text-zinc-200">
                            Crowns
                        </h3>

                        <p className="mt-4 text-3xl font-bold text-zinc-100">
                            {crowns.balance}
                        </p>

                        <p className="mt-1 text-xs text-zinc-600">
                            {crowns.earned} earned ·{" "}
                            {Math.abs(crowns.spent)} spent
                        </p>

                        <a
                            href="/dashboard/premium/crowns"
                            className="mt-5 block rounded-xl border border-white/[0.08] px-4 py-2.5 text-center text-sm text-zinc-300 transition hover:bg-white/[0.04]"
                        >
                            View Crown history
                        </a>
                    </section>

                    <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
                        <h3 className="text-sm font-semibold text-zinc-200">
                            Session
                        </h3>

                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            Signing out only ends this browser session.
                            It does not delete anything.
                        </p>

                        <LogoutButton
                            className="mt-5 block w-full rounded-xl border border-white/[0.08] px-4 py-2.5 text-center text-sm text-zinc-300 transition hover:bg-white/[0.04] disabled:opacity-40"
                        />
                    </section>
                </div>
            </div>
        </>
    );
}
