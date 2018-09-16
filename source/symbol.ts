// import * as vscode from "vscode";

// export
// class GoDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
//     public provideDocumentSymbols(
//         document: vscode.TextDocument,
//         token: vscode.CancellationToken
//     ) : Thenable<vscode.SymbolInformation[]> {
//         return new Promise<vscode.SymbolInformation[]>((resolve, reject) => {
//             const wordRange = document.getWordRangeAtPosition(position);
//             const word : string = document.getText(wordRange);
//             const lines : string[] = document.getText().split(/\r?\n/g);
//             let symbols : vscode.SymbolInformation[] = [];
//             for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
//                 const match : RegExpExecArray | null = (new RegExp(word)).exec(lines[lineNumber]);
//                 if (!match) continue;
//                 const startPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[1].length);
//                 const endPosition : vscode.Position = new vscode.Position(lineNumber, match.index + match[0].length);
//                 const range : vscode.Range = new vscode.Range(startPosition, endPosition);
//                 symbols.push(new vscode.SymbolInformation(word, vscode.SymbolKind.Variable, "", new vscode.Location(document.uri, range)));
//             }
//             return resolve(symbols);
//         });
//     }
// }