export type ServerCommandDefinition = {
    name: string;
    label: string;
    description: string;
};

export const SERVER_MANAGEABLE_COMMANDS: ServerCommandDefinition[] = [
    { name: "aesthetic", label: "/aesthetic", description: "Generate a complete coordinated aesthetic." },
    { name: "bio", label: "/bio", description: "Generate aesthetic Discord profile bios." },
    { name: "palette", label: "/palette", description: "Generate coordinated color palettes." },
    { name: "profile", label: "/profile", description: "Generate coordinated Discord profile concepts." },
    { name: "status", label: "/status", description: "Generate aesthetic Discord status ideas." },
    { name: "symbols", label: "/symbols", description: "Generate decorative aesthetic symbol combinations." },
    { name: "theme", label: "/theme", description: "Generate matching aesthetic theme previews." },
    { name: "username", label: "/username", description: "Generate aesthetic username ideas." },
];

export function isManageableServerCommand(commandName: string) {
    return SERVER_MANAGEABLE_COMMANDS.some(
        (command) => command.name === commandName
    );
}
