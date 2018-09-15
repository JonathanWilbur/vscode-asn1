// import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";

// export
// function diagnoseTwoContradictoryWordsNextToEachOther (word1 : string, word2: string, line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
//     let i : number = 0;
//     let match : RegExpExecArray | null;
//     do {
//         const matcher : RegExp = new RegExp(`\\b${word1}\\s+${word2}\\b`);
//         match = matcher.exec(line.slice(i));
//         if (match === null) break;
//         i += (match.index + 1); // "+ match[0].length" does not work for some reason.
//         const startPosition : Position = new Position(lineNumber, match.index);
//         const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
//         const range : Range = new Range(startPosition, endPosition);
//         const diag : Diagnostic = new Diagnostic(range, `Contradictory ${word1} and ${word2}.`, DiagnosticSeverity.Error);
//         diagnostics.push(diag);
//     } while (i < line.length);
// }