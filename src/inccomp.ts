import * as vscode from "vscode";

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
]);

// TODO: Just give up on inline completions? I can't even get unit tests working.

/**
 * @summary Provide inline completion items, based on position within a document
 * @param document The current text document
 * @param position The cursor position within the document
 * @param token The cancellation token
 * @returns An array of inline completion items
 * @function
 */
function provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
): vscode.InlineCompletionItem[] {
    const line = document.lineAt(position.line);
    const lineBeforeCursor = line.text.slice(0, position.character);
    if (/(--|\/\*|"|'|<)/.test(lineBeforeCursor)) {
        // Don't provide inline completions, because we are in a comment
        // or string or just in an XML value (which is not supported yet).
        return [];
    }

    const lineBeforeCursorEndTrimmed = lineBeforeCursor.trimEnd();
    const wordsBefore = lineBeforeCursorEndTrimmed.split(/\s+/);
    if (wordsBefore.length <= 1) {
        return [];
    }
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

    const zeroRange = new vscode.Range(position, position);

    const lastWord = wordsBefore[wordsBefore.length - 1];
    if (wordsBefore.length >= 2) {
        const semiLastWord = wordsBefore[wordsBefore.length - 2];
        for (const [completeWord1, completeWord2] of keywordFollowupCompletions.entries()) {
            if (!completeWord2.startsWith(lastWord) || (semiLastWord !== completeWord1)) {
                continue;
            }
            const remainingPhrase = completeWord2.slice(lastWord.length);
            return [
                new vscode.InlineCompletionItem(remainingPhrase, zeroRange),
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
            if (value.startsWith(prevWordText)) {
                const remainingPhrase = value.slice(prevWordText.length);
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
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        return provideInlineCompletionItems(document, position, token);
    }
}
