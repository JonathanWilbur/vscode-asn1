import * as vscode from "vscode";
import {
    DIAG_CODE_IMPORT_SYMBOL_DUP,
    DIAG_CODE_IMPORT_SYMBOL_UNUSED,
    DIAG_CODE_ASSIGNMENT_DUP,
    DIAG_CODE_IMPORT_MODULE_UNUSED,
} from "./diagnostics.js";
import { getParserOutputsWithLogging } from "./parsing.js";
import { getRangeFromLocation, positionFallsWithin } from "./utils.js";
import { type Module, type Production, type SymbolsFromModule } from "@wildboar/asn1-parser";

/**
 * @summary Create a command to refresh diagnostics
 * @param document The text document
 * @returns A command to refresh diagnostics
 * @function
 */
function createUpdateDiagnosticsCommand(
    document: vscode.TextDocument,
): vscode.Command {
    return {
        title: "Refresh ASN.1 diagnostics",
        command: "asn1.diagnose",
        arguments: [document.uri],
    };
}

// Function written by Cursor AI, docs written by Jonathan Wilbur
/**
 * @summary Get the proper removal range for a Symbol in a SymbolList
 * @description
 * 
 * If you naïvely remove just a `Symbol` from a `SymbolList`, the list will
 * have either leading, trailing, or doubled up commas, as well as weird
 * whitespacing. This function takes the naïve removal range and expands it
 * to possibly include a comma and whitespace so that the overall
 * `SymbolList` production remains grammatically valid.
 * 
 * @param document The text document
 * @param sfm The `SymbolsFromModule` (used to suggest removing the whole module)
 * @param symbolList The SymbolList Concrete Syntax Tree (CST) Production
 * @param symbolRange The range spanning the symbol to be removed
 * @returns A new range, expanded to include the symbol to be removed as well
 *  as the comma and whitespace before or after it
 * @function
 */
function getRemovalRangeForImportSymbol(
    document: vscode.TextDocument,
    sfm: SymbolsFromModule,
    symbolList: Production,
    symbolRange: vscode.Range,
): vscode.Range {
    const symbolStart = document.offsetAt(symbolRange.start);
    const symbolEnd = document.offsetAt(symbolRange.end);
    const symbols = symbolList.children.filter((c) => c.type === "Symbol");
    if (symbols.length <= 1) {
        if (sfm?.production) {
            return getRangeFromLocation(document, sfm.production.location);
        }
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

/**
 * @summary Provide for the removal of an imported symbol
 * @description
 * 
 * This function returns VS code actions that remove an imported symbol
 * from a `SymbolList` in an ASN.1 module.
 * 
 * @param document The text document
 * @param diag The diagnostic whose range is the symbol to be removed
 * @param currentModule The current ASN.1 module
 * @returns VS Code actions
 * @function
 */
function provideRemoveImportSymbol(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic,
    currentModule: Module,
): vscode.CodeAction[] {
    const deleteSymEdit = new vscode.WorkspaceEdit();
    const sfm = Object.values(currentModule.imports.modules)
        .find((sfm) => (
            sfm.production
            && positionFallsWithin(document, diag.range.start, sfm.production)
            && positionFallsWithin(document, diag.range.end, sfm.production)
        ));

    if (!sfm?.production) {
        return [];
    }

    if (Object.keys(sfm.symbolList).length === 1) {
        // If this is the last symbol, we can only recommend deleting the whole
        // module import, because `SymbolsFromModule` requires a single symbol.
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
        deleteSfmAction.command = createUpdateDiagnosticsCommand(document);
        /* It is syntactically valid to have an empty IMPORTS like `IMPORTS ;`,
        so we do not have to worry about deleting the whole `Imports` upon
        deleting the last `SymbolsFromModule`. */
        return [deleteSfmAction];
    } else {
        // If there is more than one symbol, we can delete just that one.
        const symbolList = sfm
            .production
            ?.children
            .find((c) => c.type === "SymbolList");
        if (symbolList) {
            deleteSymEdit.delete(
                document.uri,
                getRemovalRangeForImportSymbol(document, sfm, symbolList!, diag.range),
            );
        }
        const deleteSymAction = new vscode.CodeAction(
            "Remove this symbol",
            vscode.CodeActionKind.QuickFix,
        );
        deleteSymAction.diagnostics = [ diag ];
        deleteSymAction.isPreferred = true;
        deleteSymAction.edit = deleteSymEdit;
        deleteSymAction.command = createUpdateDiagnosticsCommand(document);
        return [deleteSymAction];
    }
}

/**
 * @summary Create a VS Code action that removes some text
 * @description
 * 
 * This function creates a VS code action that naïvely removes some text from
 * an ASN.1 document. There is little intelligence to this other than removing
 * the newline character if nothing remains on the line.
 * 
 * This also updates the diagnostics after it runs.
 * 
 * @param document The text document
 * @param diag The diagnostic warranting the removal of something
 * @param thingName The name of the thing to be removed
 * @returns VS Code action that removes this thing
 */
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
    action.command = createUpdateDiagnosticsCommand(document);
    return action;
}

/**
 * @summary Provide code actions for a single diagnostic
 * @param document The text document
 * @param diag The diagnostic for which code actions are proposed
 * @param currentModule The current ASN.1 module
 * @param actions Array of actions to output
 * @returns A promise that resolves nothing
 * @async
 * @function
 */
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
        case (DIAG_CODE_IMPORT_MODULE_UNUSED):
            actions.push(provideRemove(document, diag, "module import"));
            return;
        default: return;
    }
}

/**
 * @summary Provide code actions
 * @param document The text document
 * @param range The range or selection for which the command was invoked
 * @param context Code action provider context
 * @param cancel Cancellation token
 * @returns A promise that resolves to code actions or commands in an array.
 * @async
 * @function
 */
async function provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    cancel: vscode.CancellationToken,
): Promise<(vscode.CodeAction | vscode.Command)[]> {
    const p = await getParserOutputsWithLogging(document.uri, cancel);
    if (!p) {
        return Promise.reject(null);
    }
    const modules = p.parsedModules;
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
