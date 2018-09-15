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
//# sourceMappingURL=minmax.js.map