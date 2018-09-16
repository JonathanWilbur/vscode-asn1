"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
var diag = require("./diagnostics");
var hints = require("./hints");
var hover_1 = require("./hover");
var warnings = require("./warnings");
var keywords_1 = require("./keywords");
var definition_1 = require("./definition");
var reference_1 = require("./reference");
// import { ASN1DocumentSymbolProvider } from "./symbol";
var ASN1_MODE = { language: 'asn1', scheme: 'file' };
var diagnosticCollection;
function activate(ctx) {
    ctx.subscriptions.push(vscode_1.languages.registerHoverProvider(ASN1_MODE, new hover_1.ASN1HoverProvider()));
    ctx.subscriptions.push(vscode_1.languages.registerDefinitionProvider(ASN1_MODE, new definition_1.ASN1DefinitionProvider()));
    ctx.subscriptions.push(vscode_1.languages.registerReferenceProvider(ASN1_MODE, new reference_1.ASN1ReferenceProvider()));
    // ctx.subscriptions.push(
    //     languages.registerDocumentSymbolProvider(ASN1_MODE, new ASN1DocumentSymbolProvider()));
    // TODO: Show all Symbol Definitions in Folder
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
        // Bad Strings
        diag.diagnoseBadString(/,\s*\}/g, "Trailing comma.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/\{\s*,/g, "Leading comma.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/\|\s*\)/g, "Trailing pipe.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/\(\s*\|/g, "Leading pipe.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/FROM\s*\(\s*"[^"]{2,}"\.\."[^"]*"\s*\)/g, "FROM constraint cannot use multi-character strings in range.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/FROM\s*\(\s*"[^"]*"\.\."[^"]{2,}"\s*\)/g, "FROM constraint cannot use multi-character strings in range.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/FROM\s*\(\s*""\.\."[^"]*"\s*\)/g, "FROM constraint cannot use empty strings in range.", line, lineNumber, diagnostics);
        diag.diagnoseBadString(/FROM\s*\(\s*"[^"]*"\.\.""\s*\)/g, "FROM constraint cannot use empty strings in range.", line, lineNumber, diagnostics);
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
        diag.diagnoseTags(line, lineNumber, diagnostics);
        diag.diagnoseIntegerLiteral(line, lineNumber, diagnostics);
        diag.diagnoseEnumerated(line, lineNumber, diagnostics);
        diag.diagnoseStructuredLabeledReal(line, lineNumber, diagnostics);
        diag.diagnoseStructuredUnlabeledReal(line, lineNumber, diagnostics);
        diag.diagnoseBitString(line, lineNumber, diagnostics);
        diag.diagnoseOctetString(line, lineNumber, diagnostics);
        diag.diagnoseBoolean(line, lineNumber, diagnostics);
        diag.diagnoseRelativeObjectIdentifier(line, lineNumber, diagnostics);
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
        // String types
        diag.diagnoseCharacterStringType("NumericString", /^[0-9\s]*$/, line, lineNumber, diagnostics);
        diag.diagnoseCharacterStringType("PrintableString", /^[A-Za-z0-9 '\(\)\+,\-\.\/:=\?]*$/, line, lineNumber, diagnostics);
        diag.diagnoseCharacterStringType("UTCTime", /^\d{2}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))[0-5]\d(?:[0-5]\d)?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)$/, line, lineNumber, diagnostics);
        diag.diagnoseCharacterStringType("GeneralizedTime", /^\d{4}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))(?:[0-5]\d)?(?:[0-5]\d)?(?:(\.|,)(?:\d+))?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)?$/, line, lineNumber, diagnostics);
        // diag.diagnoseCharacterStringType("VisibleString", /^[A-Za-z0-9 '\(\)\+,\-\.\/:=\?]*$/, line, lineNumber, diagnostics);
    });
    diagnosticMap.set(event.document.uri.toString(), diagnostics);
    diagnosticMap.forEach(function (diagnostics, file) {
        diagnosticCollection.set(vscode_1.Uri.parse(file), diagnostics);
    });
}
//# sourceMappingURL=index.js.map