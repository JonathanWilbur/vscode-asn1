import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";

export
function suggestGeneralizedTime (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let indexOfMinMax : number = line.indexOf("UTCTime", i);
        if (indexOfMinMax !== -1) {
            const startPosition : Position = new Position(lineNumber, indexOfMinMax);
            const endPosition : Position = new Position(lineNumber, indexOfMinMax + "UTCTime".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "Consider using GeneralizedTime instead of UTCTime", DiagnosticSeverity.Hint);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        } else break;
    } while (i < line.length);
}