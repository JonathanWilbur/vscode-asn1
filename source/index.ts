import { Diagnostic, DiagnosticCollection, DocumentFilter, ExtensionContext, languages, TextDocumentChangeEvent, Uri, workspace, TextDocument } from "vscode";
import { LineDiagnosis } from "./diagnostics";
import { ASN1HoverProvider } from "./hover";
import { ASN1DefinitionProvider } from "./definition";
import { ASN1ReferenceProvider } from "./reference";
import { ASN1DocumentFormatter } from "./format";
// import { ASN1DocumentSymbolProvider } from "./symbol";

// See: https://github.com/Microsoft/vscode/issues/42649
languages.setLanguageConfiguration('asn1', {
    wordPattern: /\b[A-Za-z][A-Za-z0-9\-]*[A-Za-z0-9]\b/
});

const ASN1_MODE: DocumentFilter = { language: 'asn1', scheme: 'file' };
let diagnosticCollection : DiagnosticCollection;

export function activate(ctx: ExtensionContext): void {
    ctx.subscriptions.push(
        languages.registerHoverProvider(ASN1_MODE, new ASN1HoverProvider()));

    ctx.subscriptions.push(
        languages.registerDefinitionProvider(ASN1_MODE, new ASN1DefinitionProvider()));

    ctx.subscriptions.push(
        languages.registerReferenceProvider(ASN1_MODE, new ASN1ReferenceProvider()));

    // ctx.subscriptions.push(
    //     languages.registerDocumentSymbolProvider(ASN1_MODE, new ASN1DocumentSymbolProvider()));

    // TODO: Show all Symbol Definitions in Folder

    ctx.subscriptions.push(
        languages.registerDocumentFormattingEditProvider(ASN1_MODE, new ASN1DocumentFormatter()));
    
    // https://github.com/JonathanWilbur/vscode-asn1/issues/2
    LineDiagnosis.ignoreIntegerSize =
        workspace.getConfiguration("asn1").get("ignoreIntegerSize") || false;

    // This is in the VS Code extension example, but it does not say where
    // getDisposable() is or what it does.
    // ctx.subscriptions.push(getDisposable()); 
    diagnosticCollection = languages.createDiagnosticCollection('asn1');
    ctx.subscriptions.push(diagnosticCollection);
    workspace.onDidChangeTextDocument(onChange, null, ctx.subscriptions);
    workspace.onDidOpenTextDocument(onOpen, null, ctx.subscriptions);
}

function onOpen(document : TextDocument) : void {
    if (document.languageId !== "asn1") return;
    let diagnosticMap: Map<string, Diagnostic[]> = new Map();
    let diagnostics : Diagnostic[] = diagnosticMap.get(document.uri.toString());
    if (!diagnostics) diagnostics = [];
    const text : string = document.getText();
    const lines : string[] = text.split(/\r?\n/g);
    lines.forEach((line, lineNumber) => {
        (new LineDiagnosis(line, lineNumber, diagnostics)).diagnose();
    });
    diagnosticMap.set(document.uri.toString(), diagnostics);
    diagnosticMap.forEach((diagnostics, file) => {
        diagnosticCollection.set(Uri.parse(file), diagnostics);
    }); 
}

function onChange(event : TextDocumentChangeEvent) : void {
    if (event.document.languageId !== "asn1") return;
    let diagnosticMap: Map<string, Diagnostic[]> = new Map();
    let diagnostics : Diagnostic[] = diagnosticMap.get(event.document.uri.toString());
    if (!diagnostics) diagnostics = [];
    const text : string = event.document.getText();
    const lines : string[] = text.split(/\r?\n/g);
    lines.forEach((line, lineNumber) => {
        (new LineDiagnosis(line, lineNumber, diagnostics)).diagnose();
    });
    diagnosticMap.set(event.document.uri.toString(), diagnostics);
    diagnosticMap.forEach((diagnostics, file) => {
        diagnosticCollection.set(Uri.parse(file), diagnostics);
    });
}