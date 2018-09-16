import * as vscode from "vscode";

export
class ASN1ReferenceProvider implements vscode.ReferenceProvider {
    public provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        options: { includeDeclaration: boolean },
        token: vscode.CancellationToken
    ) : Thenable<vscode.Location[]> {
        return new Promise<vscode.Location[]>((resolve, reject) => {
            const wordRange = document.getWordRangeAtPosition(position);
            const word : string = document.getText(wordRange);
            const lines : string[] = document.getText().split(/\r?\n/g);
            let locations : vscode.Location[] = [];
            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                const match : RegExpExecArray | null = (new RegExp(word)).exec(lines[lineNumber]);
                if (!match) continue;
                const definitionPosition : vscode.Position = new vscode.Position(lineNumber, match.index);
                locations.push(new vscode.Location(document.uri, definitionPosition));
            }
            return resolve(locations);
        });
    }
}