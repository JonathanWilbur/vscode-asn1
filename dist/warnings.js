"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
function findMinMax(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var indexOfMinMax = line.indexOf("(MIN..MAX)", i);
        if (indexOfMinMax !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, indexOfMinMax);
            var endPosition = new vscode_1.Position(lineNumber, indexOfMinMax + "(MIN..MAX)".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "(MIN..MAX) is unnecessary", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.findMinMax = findMinMax;
function findGeneralString(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var index = line.indexOf("GeneralString", i);
        if (index !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, index);
            var endPosition = new vscode_1.Position(lineNumber, index + "GeneralString".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "GeneralString is discouraged", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.findGeneralString = findGeneralString;
function findGraphicString(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var index = line.indexOf("GraphicString", i);
        if (index !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, index);
            var endPosition = new vscode_1.Position(lineNumber, index + "GraphicString".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "GraphicString is discouraged", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.findGraphicString = findGraphicString;
function findIntegerTooBigFor32Bits(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
        match = /(\s+)(\-?\d+)\b/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var numberInQuestion = Number(match[2]);
        if (numberInQuestion > 2147483647) {
            var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "This number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
        else if (numberInQuestion < -2147483648) {
            var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "This number is too negative to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.findIntegerTooBigFor32Bits = findIntegerTooBigFor32Bits;
//# sourceMappingURL=warnings.js.map