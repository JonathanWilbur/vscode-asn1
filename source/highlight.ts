import * as vscode from "vscode";

export
class ASN1DocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    public provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ) : vscode.DocumentHighlight[] | Thenable<vscode.DocumentHighlight[]> {
        return new Promise<vscode.DocumentHighlight[]>((resolve, reject) => {
            const wordRange = document.getWordRangeAtPosition(position);
            const word : string = document.getText(wordRange);
            const lines : string[] = document.getText().split(/\r?\n/g);
            let highlights : vscode.DocumentHighlight[] = [];
            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                const match : RegExpExecArray | null = (new RegExp(word)).exec(lines[lineNumber]);
                if (!match) continue;
                const startPosition : vscode.Position = new vscode.Position(lineNumber, match.index);
                const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[0].length);
                const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                highlights.push(new vscode.DocumentHighlight(range, vscode.DocumentHighlightKind.Read)); // REVIEW: Kind?
            }
            return resolve(highlights);
        });
    }
}