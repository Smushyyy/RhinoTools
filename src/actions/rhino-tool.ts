import {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    DidReceiveSettingsEvent
} from "@elgato/streamdeck";
import { sendCommandToRhino } from "../send-keys";

// -----------------------------------------------------------------------
// Tool catalogue
// -----------------------------------------------------------------------

export interface Tool     { label: string; command: string; }
export interface Category { label: string; tools: Tool[]; }

export const CATALOGUE: Category[] = [
    // ...[existing catalogue unchanged]...
    // The CATALOGUE array remains unchanged for brevity
];

// Helper function to get tool label if user hasn't set a custom one
function getDefaultLabel(settings: Settings): string | undefined {
    for (const category of CATALOGUE) {
        const tool = category.tools.find(t => t.command === settings.command);
        if (tool) return tool.label;
    }
    return undefined;
}

// -----------------------------------------------------------------------
// Action
// -----------------------------------------------------------------------

interface Settings {
    category: string;
    command:  string;
    label:    string;
    [key: string]: string; // satisfies JsonObject — all fields are strings
}

@action({ UUID: "com.rhino3d.tools.tool" })
export class RhinoToolAction extends SingletonAction<Settings> {

    async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
        let label = ev.payload.settings.label?.trim();
        if (!label) label = getDefaultLabel(ev.payload.settings) ?? "";
        await ev.action.setTitle(label);
    }

    async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
        let label = ev.payload.settings.label?.trim();
        if (!label) label = getDefaultLabel(ev.payload.settings) ?? "";
        await ev.action.setTitle(label);
    }

    async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        const cmd = ev.payload.settings.command?.trim();
        if (!cmd) { await ev.action.showAlert(); return; }

        const ok = await sendCommandToRhino(cmd);
        if (!ok) await ev.action.showAlert();
    }
}
