import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";

export
function findMinMax (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let indexOfMinMax : number = line.indexOf("(MIN..MAX)", i);
        if (indexOfMinMax !== -1) {
            const startPosition : Position = new Position(lineNumber, indexOfMinMax);
            const endPosition : Position = new Position(lineNumber, indexOfMinMax + "(MIN..MAX)".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "(MIN..MAX) is unnecessary", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        } else break;
    } while (i < line.length);
}

export
function findGeneralString (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let index : number = line.indexOf("GeneralString", i);
        if (index !== -1) {
            const startPosition : Position = new Position(lineNumber, index);
            const endPosition : Position = new Position(lineNumber, index + "GeneralString".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "GeneralString is discouraged", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        } else break;
    } while (i < line.length);
}

export
function findGraphicString (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let index : number = line.indexOf("GraphicString", i);
        if (index !== -1) {
            const startPosition : Position = new Position(lineNumber, index);
            const endPosition : Position = new Position(lineNumber, index + "GraphicString".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "GraphicString is discouraged", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        } else break;
    } while (i < line.length);
}

export
function findIntegerTooBigFor32Bits (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
        match = /(\s+)(\-?\d+)\b/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const numberInQuestion : number = Number(match[2]);
        if (numberInQuestion > 2147483647) {
            const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "This number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        } else if (numberInQuestion < -2147483648) {
            const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "This number is too negative to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}