import { Diagnostic, DiagnosticCollection, DocumentFilter, ExtensionContext, languages, TextDocumentChangeEvent, Uri, workspace } from "vscode";
import * as diag from "./diagnostics";
import * as hints from "./hints";
import { ASN1HoverProvider } from "./hover";
import * as warnings from "./warnings";
import { keywords } from "./keywords";

const ASN1_MODE: DocumentFilter = { language: 'asn1', scheme: 'file' };
let diagnosticCollection : DiagnosticCollection;

export function activate(ctx: ExtensionContext): void {
    ctx.subscriptions.push(
        languages.registerHoverProvider(
            ASN1_MODE, new ASN1HoverProvider()));
    
    // This is in the VS Code extension example, but it does not say where
    // getDisposable() is or what it does.
    // ctx.subscriptions.push(getDisposable()); 
    diagnosticCollection = languages.createDiagnosticCollection('asn1');
    ctx.subscriptions.push(diagnosticCollection);
    workspace.onDidChangeTextDocument(onChange, null, ctx.subscriptions);
}

function onChange(event : TextDocumentChangeEvent): void {
    let diagnosticMap: Map<string, Diagnostic[]> = new Map();
    let diagnostics : Diagnostic[] = diagnosticMap.get(event.document.uri.toString());
    if (!diagnostics) diagnostics = [];
    const text : string = event.document.getText();
    const lines : string[] = text.split(/\r?\n/g);
    lines.forEach((line, lineNumber) => {
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
        keywords.forEach(keyword => {
            diag.diagnoseTwoDuplicatedWordsNextToEachOther(keyword, line, lineNumber, diagnostics);
        });
        diag.diagnoseMultipleContextSpecificTagsNextToEachOther(line, lineNumber, diagnostics);
    });
    diagnosticMap.set(event.document.uri.toString(), diagnostics);
    diagnosticMap.forEach((diagnostics, file) => {
        diagnosticCollection.set(Uri.parse(file), diagnostics);
    });
}