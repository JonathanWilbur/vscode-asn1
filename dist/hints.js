"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
function suggestGeneralizedTime(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var indexOfMinMax = line.indexOf("UTCTime", i);
        if (indexOfMinMax !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, indexOfMinMax);
            var endPosition = new vscode_1.Position(lineNumber, indexOfMinMax + "UTCTime".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Consider using GeneralizedTime instead of UTCTime", vscode_1.DiagnosticSeverity.Hint);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.suggestGeneralizedTime = suggestGeneralizedTime;
//# sourceMappingURL=hints.js.map