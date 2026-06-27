import * as vscode from "vscode";
import {
    diagnosticCollection,
    DIAG_CODE_IMPORT_SYMBOL_DUP,
    DIAG_CODE_IMPORT_SYMBOL_UNUSED,
    DIAG_CODE_ASSIGNMENT_DUP,
} from "./diagnostics.js";
import { getParserOutputs } from "./parsing.js";
import { getRangeFromLocation, positionFallsWithin } from "./utils.js";
import { SymbolsFromModule, type Module, type Production } from "@wildboar/asn1-parser";

function findSymbolListForRange(
    currentModule: Module,
    document: vscode.TextDocument,
    range: vscode.Range,
): SymbolsFromModule | undefined {
    for (const sfm of Object.values(currentModule.imports.modules)) {
        if (
            sfm.production
            && positionFallsWithin(document, range.start, sfm.production)
            && positionFallsWithin(document, range.end, sfm.production)
        ) {
            return sfm;
        }
    }
    return undefined;
}

function getRemovalRangeForImportSymbol(
    document: vscode.TextDocument,
    symbolList: Production,
    symbolRange: vscode.Range,
): vscode.Range {
    const symbolStart = document.offsetAt(symbolRange.start);
    const symbolEnd = document.offsetAt(symbolRange.end);
    const symbols = symbolList.children.filter((c) => c.type === "Symbol");
    if (symbols.length <= 1) {
        return symbolRange;
    }

    const childIndex = symbolList.children.findIndex((c) => (
        c.type === "Symbol"
        && c.location.startIndex === symbolStart
        && c.location.endIndex === symbolEnd
    ));
    if (childIndex < 0) {
        return symbolRange;
    }

    if (symbols[0].location.startIndex === symbolStart) {
        let end = symbolEnd;
        for (let i = childIndex + 1; i < symbolList.children.length; i++) {
            const child = symbolList.children[i];
            if (child.type === "Symbol") {
                break;
            }
            end = child.location.endIndex;
        }
        return new vscode.Range(symbolRange.start, document.positionAt(end));
    }

    let start = symbolStart;
    for (let i = childIndex - 1; i >= 0; i--) {
        const child = symbolList.children[i];
        if (child.type === "Symbol") {
            break;
        }
        start = child.location.startIndex;
    }
    return new vscode.Range(document.positionAt(start), symbolRange.end);
}

// ComponentTypeList ComponentType
// AlternativeTypeList NamedType
// Enumeration EnumerationItem
// NamedBitList NamedBit
// NamedNumberList NamedNumber
function provideRemoveImportSymbol(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
    currentModule: Module,
): vscode.CodeAction[] {
    const deleteSymEdit = new vscode.WorkspaceEdit();
    const sfm = findSymbolListForRange(currentModule, document, diag.range);
    const symbolList = sfm
        ?.production
        ?.children
        .find((c) => c.type === "SymbolList");
    if (symbolList) {
        deleteSymEdit.delete(
            document.uri,
            getRemovalRangeForImportSymbol(document, symbolList!, diag.range),
        );
    }

    const deleteSymAction = new vscode.CodeAction(
        "Remove this symbol",
        vscode.CodeActionKind.QuickFix,
    );
    deleteSymAction.diagnostics = [ diag ];
    deleteSymAction.isPreferred = true;
    deleteSymAction.edit = deleteSymEdit;

    if (!sfm?.production || Object.keys(sfm.symbolList).length !== 1) {
        return [deleteSymAction];
    }
    // If there is only a single unused symbol in the SFM, suggest deleting
    // the entire SFM.
    const deleteSfmEdit = new vscode.WorkspaceEdit();
    deleteSfmEdit.delete(
        document.uri, 
        getRangeFromLocation(document, sfm.production.location),
    );
    const deleteSfmAction = new vscode.CodeAction(
        "Remove the whole module import",
        vscode.CodeActionKind.QuickFix,
    );
    deleteSfmAction.diagnostics = [ diag ];
    deleteSfmAction.isPreferred = true;
    deleteSfmAction.edit = deleteSfmEdit;
    // Mark the delete-just-the-symbol action as not preferred.
    deleteSymAction.isPreferred = false;
    return [deleteSymAction, deleteSfmAction];
}

// TODO: Expand to neighboring comma.
// TODO: Remove whole line if there's nothing else on the line.
function provideRemove(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
    thingName: string,
): vscode.CodeAction {
    const edit = new vscode.WorkspaceEdit();
    edit.delete(document.uri, diag.range);
    const action = new vscode.CodeAction(
        "Remove this " + thingName,
        vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [ diag ];
    action.isPreferred = true;
    action.edit = edit;
    return action;
}

// TODO: Delete in a future commit.
// I worked really hard on this, but it just sucks.
// I cannot accept an implementation that leaves trailing commas in the line above.
// BTW, I never realized that INTEGER and BIT STRING do not allow extension markers.

// const ignoredTokenTypes: Set<string> = new Set([
//     "newlineWhitespace",
//     "nonNewlineWhitespace",
//     "comment",
// ]);

// // Differs from provideRemove by removing leading whitespace and the trailing junk.
// function provideDelist(
//     document: vscode.TextDocument,
//     diag: vscode.Diagnostic,
//     thingName: string,
// ): vscode.CodeAction {
//     const beforeText = document
//         .lineAt(diag.range.start.line)
//         .text
//         .slice(0, diag.range.start.character);
//     const trimFromStart = beforeText.length - beforeText.trimEnd().length;
//     const endlineText = document.lineAt(diag.range.end.line).text;
//     const afterText = endlineText
//         .slice(diag.range.end.character);
//     const trimAfterEnd = afterText.length - afterText.trimStart().length;
//     const startpos = new vscode.Position(
//         diag.range.start.line,
//         diag.range.start.character - trimFromStart,
//     );
//     let reprange = new vscode.Range(
//         startpos,
//         new vscode.Position(
//             diag.range.end.line,
//             diag.range.end.character + trimAfterEnd,
//         ),
//     );
//     let endcol = reprange.end.character;
//     try {
//         const lexer = lex(afterText);
//         for (const token of lexer) {
//             if (ignoredTokenTypes.has(token.type)) {
//                 endcol = document.positionAt(token.location.endIndex).character;
//             } else {
//                 break;
//             }
//         }
//         const maybeComma = lexer.next();
//         if (!maybeComma.done && (maybeComma.value.type === "comma")) {
//             endcol++;
//         }
//         for (const token of lexer) {
//             if (ignoredTokenTypes.has(token.type)) {
//                 endcol += (token.location.endIndex - token.location.startIndex);
//             } else {
//                 break;
//             }
//         }
//         reprange = new vscode.Range(
//             startpos,
//             new vscode.Position(
//                 diag.range.end.line,
//                 endcol,
//             ),
//         );
//     } catch {}

//     if (
//         (
//             (reprange.start.line < reprange.end.line) // The diagnostic already spans lines...
//             || (reprange.start.character === 0) // ...or the diagnostic starts at the SOL
//         )
//         // ... and the replacement range goes to the end of the line.
//         && reprange.end.character === endlineText.length
//     ) {
//         // ...it means we are replacing this whole line.
//         // So wrap around so we delete the newline character, too.
//         reprange = new vscode.Range(
//             startpos,
//             new vscode.Position(
//                 reprange.end.line + 1,
//                 0,
//             ),
//         );
//     }

//     const edit = new vscode.WorkspaceEdit();
//     edit.delete(document.uri, reprange);
//     const action = new vscode.CodeAction(
//         "Remove this " + thingName,
//         vscode.CodeActionKind.QuickFix,
//     );
//     action.diagnostics = [ diag ];
//     action.isPreferred = true;
//     action.edit = edit;
//     return action;
// }

async function provideCodeActionsForOneDiag(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
    currentModule: Module,
    actions: vscode.CodeAction[],
): Promise<void> {
    switch (diag.code) {
        case (DIAG_CODE_IMPORT_SYMBOL_DUP):
        case (DIAG_CODE_IMPORT_SYMBOL_UNUSED):
            actions.push(...provideRemoveImportSymbol(
                document,
                diag,
                currentModule,
            ));
        case (DIAG_CODE_ASSIGNMENT_DUP):
            actions.push(provideRemove(document, diag, "assignment"));
        default: return;
    }
}

async function provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    cancel: vscode.CancellationToken,
): Promise<(vscode.CodeAction | vscode.Command)[]> {
    const diags = diagnosticCollection.get(document.uri);
    if (!diags) {
        return Promise.reject(null);
    }
    const p = await getParserOutputs(document.uri, undefined, cancel);
    if (
        !p.parserEndState
        || ("err" in p.parserEndState)
        || p.parserEndState.ok.error
        || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
        || !p.parsedModules
        || ("err" in p.parsedModules)
    ) {
        return Promise.reject(null);
    }
    const modules = p.parsedModules.ok;

    // TODO: I think you might want to use context.diagnostics instead.
    const actions: vscode.CodeAction[] = [];
    for (const diag of diags) {
        if (cancel.isCancellationRequested) {
            return actions;
        }
        if (!range.contains(diag.range)) {
            continue;
        }
        const currentModule = modules
            .find((mod) => (
                mod.production
                && positionFallsWithin(document, diag.range.start, mod.production)
                && positionFallsWithin(document, diag.range.end, mod.production)
            ));
        if (!currentModule) {
            // User selected a position that does not fall within a module
            continue;
        }
        await provideCodeActionsForOneDiag(
            document,
            diag,
            currentModule,
            actions,
        );
    }
    return actions;
}

export class Asn1CodeActionProvider implements vscode.CodeActionProvider {
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
        return provideCodeActions(document, range, context, token);
    }
}
