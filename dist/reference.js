"use strict";
exports.__esModule = true;
var vscode = require("vscode");
var ASN1ReferenceProvider = /** @class */ (function () {
    function ASN1ReferenceProvider() {
    }
    ASN1ReferenceProvider.prototype.provideReferences = function (document, position, options, token) {
        return new Promise(function (resolve, reject) {
            var wordRange = document.getWordRangeAtPosition(position);
            var word = document.getText(wordRange);
            var lines = document.getText().split(/\r?\n/g);
            var locations = [];
            for (var lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                var match = (new RegExp(word)).exec(lines[lineNumber]);
                if (!match)
                    continue;
                var definitionPosition = new vscode.Position(lineNumber, match.index);
                locations.push(new vscode.Location(document.uri, definitionPosition));
            }
            return resolve(locations);
        });
    };
    return ASN1ReferenceProvider;
}());
exports.ASN1ReferenceProvider = ASN1ReferenceProvider;
//# sourceMappingURL=reference.js.map