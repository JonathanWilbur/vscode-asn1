import * as vscode from "vscode";
import {
    DIAG_CODE_IMPORT_SYMBOL_DUP,
    DIAG_CODE_IMPORT_SYMBOL_UNUSED,
    DIAG_CODE_ASSIGNMENT_DUP,
} from "./diagnostics.js";
import { getParserOutputs } from "./parsing.js";
import { getRangeFromLocation, positionFallsWithin } from "./utils.js";
import { type SymbolsFromModule, type Module, type Production } from "@wildboar/asn1-parser";

// Written by Cursor AI
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

// Written by Cursor AI
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

function provideRemove(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
    thingName: string,
): vscode.CodeAction {
    const edit = new vscode.WorkspaceEdit();
    const endline = document.lineAt(diag.range.end.line);
    // If we are deleting the whole last line, delete the newline char too.
    const rmrange = (endline.text.length === diag.range.end.character)
        ? new vscode.Range(
            diag.range.start,
            new vscode.Position(diag.range.end.line + 1, 0)
        )
        : diag.range;
    edit.delete(document.uri, rmrange);
    const action = new vscode.CodeAction(
        "Remove this " + thingName,
        vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [ diag ];
    action.isPreferred = true;
    action.edit = edit;
    action.command = {
        title: "Refresh ASN.1 diagnostics",
        command: "asn1.diagnose",
        arguments: [document.uri],
    };
    return action;
}

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
            return;
        case (DIAG_CODE_ASSIGNMENT_DUP):
            actions.push(provideRemove(document, diag, "assignment"));
            return;
        default: return;
    }
}

async function provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    cancel: vscode.CancellationToken,
): Promise<(vscode.CodeAction | vscode.Command)[]> {
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
    const actions: vscode.CodeAction[] = [];
    for (const diag of context.diagnostics) {
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
