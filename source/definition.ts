import * as vscode from "vscode";

export
class ASN1DefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken) : Thenable<vscode.Location> {
        return new Promise<vscode.Location>((resolve, reject) => {
            const wordRange = document.getWordRangeAtPosition(position);
            const word : string = document.getText(wordRange);
            const lines : string[] = document.getText().split(/\r?\n/g);
            for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                const match : RegExpExecArray | null = (new RegExp(`^\\s*${word}\\s+::=`)).exec(lines[lineNumber]);
                if (!match) continue;
                const definitionPosition : vscode.Position = new vscode.Position(lineNumber, match.index);
                return resolve(new vscode.Location(document.uri, definitionPosition));
            }
            return reject(null);
        });
    }
}