"use strict";
exports.__esModule = true;
var vscode = require("vscode");
var singleSpace = [
    /\{/,
    /\}/,
    /::=/,
    /--/
];
var ASN1DocumentFormatter = /** @class */ (function () {
    function ASN1DocumentFormatter() {
    }
    ASN1DocumentFormatter.prototype.provideDocumentFormattingEdits = function (document, options, token) {
        return new Promise(function (resolve, reject) {
            var lines = document.getText().split(/\r?\n/g);
            var edits = [];
            var match;
            var previousLineWasBlank = false;
            var _loop_1 = function (lineNumber) {
                // Single Spacing
                singleSpace.forEach(function (regex) {
                    var matcher = new RegExp("\\S\\s*(" + regex.source + ")\\s*\\S");
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        var startPosition = new vscode.Position(lineNumber, (match.index + 1));
                        var endPosition = new vscode.Position(lineNumber, match.index + match[0].length - 1);
                        var range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, " " + match[1] + " "));
                    }
                });
                // Comma formatting
                {
                    var matcher = /(\s*,\s+)\S/;
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        var startPosition = new vscode.Position(lineNumber, match.index);
                        var endPosition = new vscode.Position(lineNumber, match.index + match[1].length);
                        var range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ", "));
                    }
                }
                // Terminal moustaches
                [/\{/, /\}/].forEach(function (regex) {
                    var matcher = new RegExp("\\S\\s*(" + regex.source + ")\\s*$");
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        var startPosition = new vscode.Position(lineNumber, (match.index + 1));
                        var endPosition = new vscode.Position(lineNumber, match.index + match[0].length);
                        var range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, " " + match[1]));
                    }
                });
                // Terminal comma
                {
                    var matcher = /,\s*$/;
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        var startPosition = new vscode.Position(lineNumber, match.index);
                        var endPosition = new vscode.Position(lineNumber, match.index + match[0].length);
                        var range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ","));
                    }
                }
                // SIZE constraint formatting
                {
                    var matcher = /\bSIZE\s*\(/;
                    match = matcher.exec(lines[lineNumber]);
                    if (match) {
                        var startPosition = new vscode.Position(lineNumber, match.index);
                        var endPosition = new vscode.Position(lineNumber, match.index + match[0].length);
                        var range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, "SIZE ("));
                    }
                }
                // Remove double newlines
                if (/^\s*$/.test(lines[lineNumber])) {
                    if (previousLineWasBlank) {
                        var startPosition = new vscode.Position(lineNumber - 1, 0);
                        var endPosition = new vscode.Position(lineNumber, 0);
                        var range = new vscode.Range(startPosition, endPosition);
                        edits.push(new vscode.TextEdit(range, ""));
                    }
                    previousLineWasBlank = true;
                }
                else {
                    previousLineWasBlank = false;
                }
            };
            for (var lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                _loop_1(lineNumber);
            }
            return resolve(edits);
        });
    };
    return ASN1DocumentFormatter;
}());
exports.ASN1DocumentFormatter = ASN1DocumentFormatter;
//# sourceMappingURL=format.js.map