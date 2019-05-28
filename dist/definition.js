"use strict";
exports.__esModule = true;
var vscode = require("vscode");
var ASN1DefinitionProvider = /** @class */ (function () {
    function ASN1DefinitionProvider() {
    }
    ASN1DefinitionProvider.prototype.provideDefinition = function (document, position, token) {
        return new Promise(function (resolve, reject) {
            var wordRange = document.getWordRangeAtPosition(position);
            var word = document.getText(wordRange);
            var lines = document.getText().split(/\r?\n/g);
            for (var lineNumber = 0; lineNumber < lines.length; lineNumber++) {
                var match = (new RegExp("^\\s*" + word + "\\s*(?:(?:\\s+|(?:{+\\s*)+)[A-Za-z][A-Za-z0-9-]*[A-Za-z0-9][\\s}]*)?::=")).exec(lines[lineNumber]);
                if (!match)
                    continue;
                var definitionPosition = new vscode.Position(lineNumber, match.index);
                return resolve(new vscode.Location(document.uri, definitionPosition));
            }
            return reject(null);
        });
    };
    return ASN1DefinitionProvider;
}());
exports.ASN1DefinitionProvider = ASN1DefinitionProvider;
//# sourceMappingURL=definition.js.map