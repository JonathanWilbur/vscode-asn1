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
        console.log(`for doc ${uri.toString()}: ${parsedVersion}`);
        // Sleep for a quarter-second to avoid overwhelming the extension host with commands.
        await new Promise((r) => setTimeout(r, 250));
        now = (new Date()).valueOf();
    }
}

/**
 * @summary Get the index _after_ `needle` in the `haystack` 
 * @param haystack The string to search in
 * @param needle The string sought after in `haystack`
 * @returns The index _after_ `needle` in the `haystack`
 * @function
 */
export function indexAfter(haystack: string, needle: string): number {
    const i = haystack.indexOf(needle);
    if (i < 0) {
        return i;
    }
    return i + needle.length;
}