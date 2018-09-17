import * as vscode from "vscode";

const singleSpace : RegExp[] = [
    /\{/,
    /\}/,
    /::=/,
    /--/
];

export
class ASN1DocumentFormatter implements vscode.DocumentFormattingEditProvider {
    public provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ) : Thenable<vscode.TextEdit[]> {
        return new Promise<vscode.TextEdit[]>((resolve, reject) => {
            const lines : string[] = document.getText().split(/\r?\n/g);
            let edits : vscode.TextEdit[] = [];
            let match : RegExpExecArray | null;
            let previousLineWasBlank : boolean = false;
            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {

                // Single Spacing
                singleSpace.forEach(regex => {
                    const matcher : RegExp = new RegExp("\\S\\s*(" + regex.source + ")\\s*\\S");
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        const startPosition : vscode.Position = new vscode.Position(lineNumber, (match.index + 1));
                        const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[0].length - 1);
                        const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ` ${match[1]} `));
                    }
                });

                // Comma formatting
                {
                    const matcher : RegExp = /(\s*,\s+)\S/;
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        const startPosition : vscode.Position = new vscode.Position(lineNumber, match.index);
                        const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[1].length);
                        const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ", "));
                    }
                }

                // Terminal moustaches
                [ /\{/, /\}/ ].forEach(regex => {
                    const matcher : RegExp = new RegExp("\\S\\s*(" + regex.source + ")\\s*$");
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        const startPosition : vscode.Position = new vscode.Position(lineNumber, (match.index + 1));
                        const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[0].length);
                        const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ` ${match[1]}`));
                    }
                });

                // Terminal comma
                {
                    const matcher : RegExp = /,\s*$/;
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        const startPosition : vscode.Position = new vscode.Position(lineNumber, match.index);
                        const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[0].length);
                        const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ","));
                    }
                }

                // SIZE constraint formatting
                {
                    const matcher : RegExp = /\bSIZE\s*\(/;
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        const startPosition : vscode.Position = new vscode.Position(lineNumber, match.index);
                        const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[0].length);
                        const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, "SIZE ("));
                    }
                }

                // Remove double newlines
                if (/^\s*$/.test(lines[lineNumber])) {
                    if (previousLineWasBlank) {
                        const startPosition : vscode.Position = new vscode.Position(lineNumber - 1, 0);
                        const endPosition : vscode.Position = new vscode.Position(lineNumber, 0);
                        const range : vscode.Range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ""));
                    }
                    previousLineWasBlank = true;
                } else {
                    previousLineWasBlank = false;
                }
            }

            return resolve(edits);
        });
    }
}

