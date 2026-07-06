import * as vscode from "vscode";
import { inOpenSyntaxRegion } from "./utils.js";

/**
 * When the user finishes typing one of these keywords, suggest the
 * corresponding follow-up text as an inline completion.
 */
const keywordFollowupCompletions: ReadonlyMap<string, string> = new Map([
    ["OBJECT", "IDENTIFIER"],
    ["OCTET", "STRING"],
    ["BIT", "STRING"],
    ["CHARACTER", "STRING"],
    ["AUTOMATIC", "TAGS"],
    ["DEFINITIONS", "::= BEGIN"],
    ["EMBEDDED", "PDV"],
    ["EXTENSIBILITY", "IMPLIED"],
    ["CONSTRAINED", "BY"],
    ["EXPORTS", "ALL;"],
    ["ENCODED", "BY"],
    ["IDENTIFIED", "BY"],
]);

async function provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
    const line = document.lineAt(position.line);
    const lineBeforeCursor = line.text.slice(0, position.character);
    if (inOpenSyntaxRegion(lineBeforeCursor)) {
        // Don't provide inline completions, because we are in a comment
        // or string or something.
        return [];
    }
    const openingPointyBracket = lineBeforeCursor.indexOf("<");
    if (openingPointyBracket > -1 || token.isCancellationRequested) {
        // Assume that we are in an XML value.
        // Completions would be fine here, but not supported currently.
        return [];
    }

    const lineBeforeCursorEndTrimmed = lineBeforeCursor.trimEnd();

    const wordsBefore = lineBeforeCursorEndTrimmed.split(/\s+/);
    if (
        (wordsBefore.length === 4)
        && (wordsBefore[0] === '')
        && (/[a-z][A-Za-z0-9-]*/.test(wordsBefore[1]))
        && ("DEFAULT".startsWith(wordsBefore[3]))
    ) {
        if (wordsBefore[2] === "BOOLEAN") {
            const remainingFalse = "DEFAULT FALSE";
            const remainingTrue = "DEFAULT TRUE";
            const range = new vscode.Range(
                new vscode.Position(position.line, position.character - wordsBefore[3].length),
                position,
            );
            return [
                new vscode.InlineCompletionItem(remainingFalse, range),
                new vscode.InlineCompletionItem(remainingTrue, range),
            ];
        } else if (wordsBefore[2] === "INTEGER") {
            const remaining = "DEFAULT 0";
            const range = new vscode.Range(
                new vscode.Position(position.line, position.character - wordsBefore[3].length),
                position,
            );
            return [
                new vscode.InlineCompletionItem(remaining, range),
            ];
        }
    }
    
    const whitespacesBeforeCursor = lineBeforeCursor.length - lineBeforeCursorEndTrimmed.length;
    const positionBeforeLastWhitespace = new vscode.Position(
        position.line,
        // Minus one extra char so we are definitely within the word before.
        position.character - (whitespacesBeforeCursor + 1),
    );
    const prevWordRange = document.getWordRangeAtPosition(positionBeforeLastWhitespace);
    const prevWordText = prevWordRange && document.getText(prevWordRange);
    if (!prevWordText || token.isCancellationRequested) {
        return []; // If there is no previous word, we cannot suggest anything.
    }

    const zeroRange = new vscode.Range(position, position);

    if (whitespacesBeforeCursor > 0) {
        // 1. The previous would must match lookup exactly.
        // 2. We have to trim the start of the completion suggestion.
        const followup = keywordFollowupCompletions.get(prevWordText);
        if (followup) {
            return [
                new vscode.InlineCompletionItem(followup, zeroRange),
            ];
        }
    } else if (prevWordText.length >= 3) {
        // whitespacesBeforeCursor === 0: the previous word might not be done yet.
        // 1. So we have to do prefix matching.
        // 2. We do NOT have to trim the start of the completion suggestion.
        for (const [key, value] of keywordFollowupCompletions.entries()) {
            if (token.isCancellationRequested) {
                return [];
            }
            if (key.startsWith(prevWordText)) {
                const remainingPhrase = `${key} ${value}`.slice(prevWordText.length);
                return [
                    new vscode.InlineCompletionItem(remainingPhrase, zeroRange),
                ];
            }
        }
    }
    return [];
}

export class Asn1InlineCompletionItemProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        return provideInlineCompletionItems(document, position, context, token);
    }
}
