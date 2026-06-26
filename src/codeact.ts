import * as vscode from "vscode";
import { diagnosticCollection } from "./diagnostics.js";
import { getParserOutputs } from "./parsing.js";
import { positionFallsWithin } from "./utils.js";
import { type Module } from "@wildboar/asn1-parser";

// - [ ] Code Action: remove unnecessary / duplicate import
// - [ ] Code Action: remove duplicate assignment
// - [ ] Code Action: remove duplicate named number, named bit, etc.
// - [ ] Code Action: include missing import
// - [ ] Code Action: Replace `ANY` with `TYPE-IDENTIFIER.&Type`
// - [ ] Code Action: remove duplicate SET / SEQ components

async function provideCodeActionsForOneDiag(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    cancel: vscode.CancellationToken,
    diag: vscode.Diagnostic,
    currentModule: Module,
    actions: vscode.CodeAction[],
): Promise<void> {
    // Only code action supported is removing unnecessary symbols.
    if (!diag.tags?.some((t) => t === vscode.DiagnosticTag.Unnecessary)) {
        return;
    }

    // currentModule.imports.production

    const action = new vscode.CodeAction(
        "Remove this symbol",
        vscode.CodeActionKind.QuickFix,
    );
    const edit = new vscode.WorkspaceEdit();
    
    const rangeBefore = new vscode.Range(
        new vscode.Position(0, 0),
        diag.range.start,
    );
    const textBefore = document.getText(rangeBefore).trimEnd();
    const newStart = textBefore.endsWith(",")
        ? document.positionAt(textBefore.length - 1)
        : document.positionAt(textBefore.length);
    const rmRange = new vscode.Range(newStart, diag.range.end);

    /*
    FIXME: This naive comma removal approach is not valid. What happens
    if you remove a symbol from the start of a list? Then the list starts
    with a comma. But you cannot remove both, either.
    */
    edit.replace(document.uri, rmRange, "", {
        needsConfirmation: false,
        label: "Remove this symbol",
    });
    action.diagnostics = [ diag ];
    action.isPreferred = true;
    action.edit = edit;
    actions.push(action);
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
    const cst = p.parserEndState.ok.cst;

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
            range,
            context,
            cancel,
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
