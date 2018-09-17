import { Diagnostic, DiagnosticCollection, DocumentFilter, ExtensionContext, languages, TextDocumentChangeEvent, Uri, workspace } from "vscode";
import * as diag from "./diagnostics";
import { ASN1HoverProvider } from "./hover";
import { keywords } from "./keywords";
import { ASN1DefinitionProvider } from "./definition";
import { ASN1ReferenceProvider } from "./reference";
import { ASN1DocumentFormatter } from "./format";
// import { ASN1DocumentSymbolProvider } from "./symbol";

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
        diag.suggestGeneralizedTime(line, lineNumber, diagnostics);
        diag.findMinMax(line, lineNumber, diagnostics);
        diag.findGeneralString(line, lineNumber, diagnostics);
        diag.findGraphicString(line, lineNumber, diagnostics);
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
        keywords.forEach(keyword => {
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
    diagnosticMap.forEach((diagnostics, file) => {
        diagnosticCollection.set(Uri.parse(file), diagnostics);
    });
}