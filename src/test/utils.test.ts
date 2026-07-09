import * as vscode from 'vscode';
import type { VersionNumber } from "../types.js";

/**
 * @summary Wait until `document` is done parsing
 * @param document The document to poll for parsing completion
 * @param timeoutMS The timeout in milliseconds
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export async function pollUntilParsingIsDone(
    document: vscode.TextDocument,
    timeoutMS: number = 5000,
): Promise<void> {
    const uri = document.uri;
    const expectedVersion = document.version;
    let now = (new Date()).valueOf();
    const end = now + timeoutMS;
    let parsedVersion: VersionNumber | undefined;
    while (
        (parsedVersion !== expectedVersion)
        && (now < end)
    ) {
        parsedVersion = await vscode.commands.executeCommand<VersionNumber | undefined>("asn1.parsed-version", uri);
        // Sleep for a quarter-second to avoid overwhelming the extension host with commands.
        await new Promise((r) => setTimeout(r, 250));
        now = (new Date()).valueOf();
    }
}
