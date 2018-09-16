"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
var diag = require("./diagnostics");
var hints = require("./hints");
var hover_1 = require("./hover");
var warnings = require("./warnings");
var keywords_1 = require("./keywords");
var ASN1_MODE = { language: 'asn1', scheme: 'file' };
var diagnosticCollection;
function activate(ctx) {
    ctx.subscriptions.push(vscode_1.languages.registerHoverProvider(ASN1_MODE, new hover_1.ASN1HoverProvider()));
    // This is in the VS Code extension example, but it does not say where
    // getDisposable() is or what it does.
    // ctx.subscriptions.push(getDisposable()); 
    diagnosticCollection = vscode_1.languages.createDiagnosticCollection('asn1');
    ctx.subscriptions.push(diagnosticCollection);
    vscode_1.workspace.onDidChangeTextDocument(onChange, null, ctx.subscriptions);
}
exports.activate = activate;
function onChange(event) {
    var diagnosticMap = new Map();
    var diagnostics = diagnosticMap.get(event.document.uri.toString());
    if (!diagnostics)
        diagnostics = [];
    var text = event.document.getText();
    var lines = text.split(/\r?\n/g);
    lines.forEach(function (line, lineNumber) {
        // TODO: Find a more elegant way of doing this.
        hints.suggestGeneralizedTime(line, lineNumber, diagnostics);
        warnings.findMinMax(line, lineNumber, diagnostics);
        warnings.findGeneralString(line, lineNumber, diagnostics);
        warnings.findGraphicString(line, lineNumber, diagnostics);
        diag.diagnoseRange(line, lineNumber, diagnostics);
        diag.diagnoseObjectIdentifier(line, lineNumber, diagnostics);
        // diag.diagnoseRequirementContradiction(line, lineNumber, diagnostics);
        // diag.diagnoseTaggingMode(line, lineNumber, diagnostics);
        diag.diagnoseBinaryStringLiterals(line, lineNumber, diagnostics);
        diag.diagnoseHexadecimalStringLiterals(line, lineNumber, diagnostics);
        diag.diagnoseUTCTime(line, lineNumber, diagnostics);
        diag.diagnoseGeneralizedTime(line, lineNumber, diagnostics);
        // Contradictions
        diag.diagnoseTwoContradictoryWordsNextToEachOther("APPLICATION", "UNIVERSAL", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("PRIVATE", "UNIVERSAL", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("APPLICATION", "PRIVATE", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("EXPLICIT", "IMPLICIT", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("OPTIONAL", "PRESENT", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("OPTIONAL", "ABSENT", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("PRESENT", "ABSENT", line, lineNumber, diagnostics);
        diag.diagnoseTwoContradictoryWordsNextToEachOther("OPTIONAL", "DEFAULT", line, lineNumber, diagnostics);
        // Duplications
        keywords_1.keywords.forEach(function (keyword) {
            diag.diagnoseTwoDuplicatedWordsNextToEachOther(keyword, line, lineNumber, diagnostics);
        });
        diag.diagnoseMultipleContextSpecificTagsNextToEachOther(line, lineNumber, diagnostics);
    });
    diagnosticMap.set(event.document.uri.toString(), diagnostics);
    diagnosticMap.forEach(function (diagnostics, file) {
        diagnosticCollection.set(vscode_1.Uri.parse(file), diagnostics);
    });
}
//# sourceMappingURL=index.js.map