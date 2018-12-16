"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
var diagnostics_1 = require("./diagnostics");
var hover_1 = require("./hover");
var definition_1 = require("./definition");
var reference_1 = require("./reference");
var format_1 = require("./format");
// import { ASN1DocumentSymbolProvider } from "./symbol";
// See: https://github.com/Microsoft/vscode/issues/42649
vscode_1.languages.setLanguageConfiguration('asn1', {
    wordPattern: /\b[A-Za-z][A-Za-z0-9\-]*[A-Za-z0-9]\b/
});
var ASN1_MODE = { language: 'asn1', scheme: 'file' };
var diagnosticCollection;
function activate(ctx) {
    ctx.subscriptions.push(vscode_1.languages.registerHoverProvider(ASN1_MODE, new hover_1.ASN1HoverProvider()));
    ctx.subscriptions.push(vscode_1.languages.registerDefinitionProvider(ASN1_MODE, new definition_1.ASN1DefinitionProvider()));
    ctx.subscriptions.push(vscode_1.languages.registerReferenceProvider(ASN1_MODE, new reference_1.ASN1ReferenceProvider()));
    // ctx.subscriptions.push(
    //     languages.registerDocumentSymbolProvider(ASN1_MODE, new ASN1DocumentSymbolProvider()));
    // TODO: Show all Symbol Definitions in Folder
    ctx.subscriptions.push(vscode_1.languages.registerDocumentFormattingEditProvider(ASN1_MODE, new format_1.ASN1DocumentFormatter()));
    // https://github.com/JonathanWilbur/vscode-asn1/issues/2
    diagnostics_1.LineDiagnosis.ignoreIntegerSize =
        vscode_1.workspace.getConfiguration("asn1").get("ignoreIntegerSize") || false;
    // This is in the VS Code extension example, but it does not say where
    // getDisposable() is or what it does.
    // ctx.subscriptions.push(getDisposable()); 
    diagnosticCollection = vscode_1.languages.createDiagnosticCollection('asn1');
    ctx.subscriptions.push(diagnosticCollection);
    vscode_1.workspace.onDidChangeTextDocument(onChange, null, ctx.subscriptions);
    vscode_1.workspace.onDidOpenTextDocument(onOpen, null, ctx.subscriptions);
}
exports.activate = activate;
function onOpen(document) {
    var diagnosticMap = new Map();
    var diagnostics = diagnosticMap.get(document.uri.toString());
    if (!diagnostics)
        diagnostics = [];
    var text = document.getText();
    var lines = text.split(/\r?\n/g);
    lines.forEach(function (line, lineNumber) {
        (new diagnostics_1.LineDiagnosis(line, lineNumber, diagnostics)).diagnose();
    });
    diagnosticMap.set(document.uri.toString(), diagnostics);
    diagnosticMap.forEach(function (diagnostics, file) {
        diagnosticCollection.set(vscode_1.Uri.parse(file), diagnostics);
    });
}
function onChange(event) {
    var diagnosticMap = new Map();
    var diagnostics = diagnosticMap.get(event.document.uri.toString());
    if (!diagnostics)
        diagnostics = [];
    var text = event.document.getText();
    var lines = text.split(/\r?\n/g);
    lines.forEach(function (line, lineNumber) {
        (new diagnostics_1.LineDiagnosis(line, lineNumber, diagnostics)).diagnose();
    });
    diagnosticMap.set(event.document.uri.toString(), diagnostics);
    diagnosticMap.forEach(function (diagnostics, file) {
        diagnosticCollection.set(vscode_1.Uri.parse(file), diagnostics);
    });
}
//# sourceMappingURL=index.js.map