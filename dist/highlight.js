"use strict";
exports.__esModule = true;
var vscode = require("vscode");
var ASN1DocumentHighlightProvider = /** @class */ (function () {
    function ASN1DocumentHighlightProvider() {
    }
    ASN1DocumentHighlightProvider.prototype.provideDocumentHighlights = function (document, position, token) {
        return new Promise(function (resolve, reject) {
            var wordRange = document.getWordRangeAtPosition(position);
            var word = document.getText(wordRange);
            var lines = document.getText().split(/\r?\n/g);
            var highlights = [];
            for (var lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                var match = (new RegExp(word)).exec(lines[lineNumber]);
                if (!match)
                    continue;
                var startPosition = new vscode.Position(lineNumber, match.index);
                var endPosition = new vscode.Position(lineNumber, match.index + match[0].length);
                var range = new vscode.Range(startPosition, endPosition);
                highlights.push(new vscode.DocumentHighlight(range, vscode.DocumentHighlightKind.Read)); // REVIEW: Kind?
            }
            return resolve(highlights);
        });
    };
    return ASN1DocumentHighlightProvider;
}());
exports.ASN1DocumentHighlightProvider = ASN1DocumentHighlightProvider;
//# sourceMappingURL=highlight.js.map