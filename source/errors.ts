import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";

export
function diagnoseRange (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\((\d+)\.\.(\d+)\)/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        if (Number(match[1]) < 0)
        if (Number(match[1]) > Number(match[2])) {
            const startPosition : Position = new Position(lineNumber, match.index);
            const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is greater than maximum boundary.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}