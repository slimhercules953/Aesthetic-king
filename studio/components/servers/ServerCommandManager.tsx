"use client";

import {
    Check,
    Command,
    LoaderCircle,
} from "lucide-react";

import {
    useMemo,
    useState,
} from "react";

import {
    SERVER_MANAGEABLE_COMMANDS,
} from "../../lib/serverCommands";

type ServerCommandManagerProps = {
    guildId: string;
    initialSettings: Record<
        string,
        boolean
    >;
};

export default function ServerCommandManager({
    guildId,
    initialSettings,
}: ServerCommandManagerProps) {
    const [
        settings,
        setSettings,
    ] = useState<
        Record<string, boolean>
    >(() =>
        Object.fromEntries(
            SERVER_MANAGEABLE_COMMANDS.map(
                (command) => [
                    command.name,
                    initialSettings[
                        command.name
                    ] ?? true,
                ]
            )
        )
    );

    const [
        savingCommand,
        setSavingCommand,
    ] = useState<
        string | null
    >(null);

    const [
        error,
        setError,
    ] = useState<
        string | null
    >(null);

    const enabledCount =
        useMemo(
            () =>
                SERVER_MANAGEABLE_COMMANDS.filter(
                    (command) =>
                        settings[
                            command.name
                        ] !== false
                ).length,
            [settings]
        );

    async function toggleCommand(
        commandName: string
    ) {
        if (savingCommand) {
            return;
        }

        const current =
            settings[
                commandName
            ] !== false;

        const next =
            !current;

        setSavingCommand(
            commandName
        );
        setError(null);

        try {
            const response =
                await fetch(
                    `/api/servers/${guildId}/commands`,
                    {
                        method:
                            "PATCH",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body:
                            JSON.stringify({
                                commandName,
                                enabled:
                                    next,
                            }),
                    }
                );

            const body =
                await response.json() as {
                    error?: string;
                };

            if (!response.ok) {
                throw new Error(
                    body.error ||
                        "Could not update command."
                );
            }

            setSettings(
                (
                    currentSettings
                ) => ({
                    ...currentSettings,
                    [commandName]:
                        next,
                })
            );
        } catch (
            caughtError
        ) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Something went wrong."
            );
        } finally {
            setSavingCommand(
                null
            );
        }
    }

    return (
        <section className="rounded-3xl border border-white/[0.06] bg-[#101015] p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-400">
                        Command Management
                    </p>

                    <h2 className="mt-2 text-xl font-semibold">
                        Server Commands
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                        Choose which Aesthetic King
                        creative commands members can
                        use in this server.
                    </p>
                </div>

                <div className="rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                    <p className="text-2xl font-bold text-zinc-200">
                        {enabledCount}/
                        {
                            SERVER_MANAGEABLE_COMMANDS.length
                        }
                    </p>

                    <p className="text-xs text-zinc-600">
                        commands enabled
                    </p>
                </div>
            </div>

            {error && (
                <p className="mt-5 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 py-3 text-sm text-red-400">
                    {
                        error
                    }
                </p>
            )}

            <div className="mt-7 divide-y divide-white/[0.05] overflow-hidden rounded-2xl border border-white/[0.06] bg-black/10">
                {SERVER_MANAGEABLE_COMMANDS.map(
                    (command) => {
                        const enabled =
                            settings[
                                command.name
                            ] !== false;

                        const saving =
                            savingCommand ===
                            command.name;

                        return (
                            <div
                                key={
                                    command.name
                                }
                                className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div className="flex min-w-0 items-start gap-4">
                                    <div className="mt-0.5 rounded-xl bg-violet-500/10 p-2.5 text-violet-400">
                                        <Command
                                            size={
                                                17
                                            }
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-mono text-sm font-semibold text-zinc-200">
                                                {
                                                    command.label
                                                }
                                            </p>

                                            {enabled && (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                                    <Check
                                                        size={
                                                            11
                                                        }
                                                    />
                                                    Enabled
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 text-sm leading-6 text-zinc-600">
                                            {
                                                command.description
                                            }
                                        </p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    disabled={
                                        Boolean(
                                            savingCommand
                                        )
                                    }
                                    onClick={() =>
                                        toggleCommand(
                                            command.name
                                        )
                                    }
                                    className={[
                                        "relative h-8 w-14 shrink-0 rounded-full border transition",
                                        enabled
                                            ? "border-violet-500/30 bg-violet-500/25"
                                            : "border-white/[0.08] bg-zinc-900",
                                        savingCommand
                                            ? "cursor-not-allowed opacity-50"
                                            : "",
                                    ].join(
                                        " "
                                    )}
                                    aria-label={`${
                                        enabled
                                            ? "Disable"
                                            : "Enable"
                                    } ${command.label}`}
                                >
                                    {saving ? (
                                        <LoaderCircle
                                            size={
                                                15
                                            }
                                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-400"
                                        />
                                    ) : (
                                        <span
                                            className={[
                                                "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition",
                                                enabled
                                                    ? "left-7"
                                                    : "left-1",
                                            ].join(
                                                " "
                                            )}
                                        />
                                    )}
                                </button>
                            </div>
                        );
                    }
                )}
            </div>

            <div className="mt-5 rounded-2xl border border-white/[0.05] bg-white/[0.015] px-4 py-3 text-xs leading-5 text-zinc-600">
                <span className="font-medium text-zinc-500">
                    /ping
                </span>{" "}
                is always available as a diagnostic
                command and cannot be disabled here.
            </div>
        </section>
    );
}
