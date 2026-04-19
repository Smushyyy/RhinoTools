import { exec } from "child_process";

/**
 * Types a Rhino command into the active window, exactly like a keyboard macro.
 *
 * PowerShell runs hidden (no window, no focus stealing).
 * Stream Deck button presses don't steal focus, so Rhino stays active
 * and receives the keystrokes directly.
 */
export function sendCommandToRhino(command: string): Promise<boolean> {
    return new Promise((resolve) => {
        // Escape single quotes for the PS single-quoted string
        const safeCmd = command.replace(/'/g, "''");

        const script = [
            "Add-Type -AssemblyName System.Windows.Forms",
            `[System.Windows.Forms.SendKeys]::SendWait('${safeCmd} ')`,
        ].join("\n");

        // Encode as UTF-16 LE base64 — required by PowerShell -EncodedCommand
        const buf = Buffer.alloc(script.length * 2);
        for (let i = 0; i < script.length; i++) buf.writeUInt16LE(script.charCodeAt(i), i * 2);
        const encoded = buf.toString("base64");

        exec(
            `powershell -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded}`,
            { timeout: 5000 },
            (err: Error | null) => resolve(err === null)
        );
    });
}
