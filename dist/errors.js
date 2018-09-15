"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
function diagnoseRange(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\((\d+)\.\.(\d+)\)/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        if (Number(match[1]) < 0)
            if (Number(match[1]) > Number(match[2])) {
                var startPosition = new vscode_1.Position(lineNumber, match.index);
                var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "Minimum boundary is greater than maximum boundary.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
            }
    } while (i < line.length);
}
exports.diagnoseRange = diagnoseRange;
//# sourceMappingURL=errors.js.map