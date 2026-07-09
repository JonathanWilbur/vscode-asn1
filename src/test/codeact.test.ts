import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const FIRST_SYM: string = "first";
const SECOND_SYM: string = "second";
const BRACKETS_SYM: string = "thirdWithBrackets{}";
const USED_SYM: string = "used";
const LAST_SYM: string = "last";

const allImportedSymbols: string[] = [
    FIRST_SYM,
    SECOND_SYM,
    BRACKETS_SYM,
    USED_SYM,
    LAST_SYM,
];

const ASN1_BEFORE_SYMBOL_REMOVAL: string = `
ModuleName DEFINITIONS ::= BEGIN
IMPORTS
    ${allImportedSymbols.join(", ")}
    FROM OtherModule;
usedAlias TYPE-IDENTIFIER ::= used
END
`;

const ASN1_BEFORE_SFM_REMOVAL: string = `
ModuleName DEFINITIONS ::= BEGIN
IMPORTS
    onlySymbol
    FROM OtherModule
    
    hahaJustKiddingOtherSymbol
    FROM YetAnotherModule
    ;
usedAlias TYPE-IDENTIFIER ::= hahaJustKiddingOtherSymbol
END
`;

const ASN1_WITH_DUP_ASSNS: string = `
ModuleName DEFINITIONS ::= BEGIN int INTEGER ::= 1 int INTEGER ::= 2 END
`;


suite('Code Actions', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);
    test('Correctly removes the symbols from imports without leaving commas or whitespace', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        for (const symbolToDelete of allImportedSymbols) {
            const document = await vscode.workspace.openTextDocument({
                language: "asn1",
                content: ASN1_BEFORE_SYMBOL_REMOVAL,
            });
            const editor = await vscode.window.showTextDocument(document);
            // Trigger diagnostics. Quick fixes rely on this.
            await vscode.commands.executeCommand("asn1.diagnose");
            // Just in case this differs from ASN1_BEFORE_SYMBOL_REMOVAL
            const initialText = document.getText();
            const offset = initialText.indexOf(symbolToDelete);
            const start = document.positionAt(offset);
            const end = document.positionAt(offset + symbolToDelete.length);
            const range = new vscode.Selection(start, end);
            const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
                "vscode.executeCodeActionProvider",
                document.uri,
                range,
                vscode.CodeActionKind.QuickFix.value
            );

            assert.ok(actions.length > 0);
            const action = actions
                .find((a) => a.title.toLowerCase() === "remove this symbol");
            if (symbolToDelete === USED_SYM) {
                // There should NOT be a "remove this symbol" proposed because it is in use.
                assert.ok(!action);
                continue;
            }
            assert.ok(action);
            if (action?.edit) {
                await vscode.workspace.applyEdit(action.edit);
            }

            if (action?.command) {
                await vscode.commands.executeCommand(
                    action.command.command,
                    ...(action.command.arguments ?? [])
                );
            }

            const remainingSymbolsText = allImportedSymbols
                .filter((s) => s !== symbolToDelete)
                .join(", ")
                ;
            const actualText = document.getText();
            // Make sure none of the other symbols were deleted
            const matchIndex = actualText.indexOf(remainingSymbolsText);
            assert.ok(matchIndex > 0);
            // Make sure there are no leading commas
            const textBefore = actualText.slice(0, matchIndex);
            assert.ok(!/,\s*$/.test(textBefore));
            // Make sure there are no trailing commas
            const textAfter = actualText.slice(matchIndex + remainingSymbolsText.length);
            assert.ok(!/^\s*,/.test(textAfter));
        }
    });

    test('Correctly removes an entire SymbolsFromModule', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_BEFORE_SFM_REMOVAL,
        });
        const editor = await vscode.window.showTextDocument(document);
        const symbolToDelete: string = "onlySymbol";
        // Trigger diagnostics. Quick fixes rely on this.
        await vscode.commands.executeCommand("asn1.diagnose");
        // Just in case this differs from ASN1_BEFORE_SYMBOL_REMOVAL
        const initialText = document.getText();
        const offset = initialText.indexOf(symbolToDelete);
        const start = document.positionAt(offset);
        const end = new vscode.Position(start.line + 2, 0);
        const range = new vscode.Selection(start, end);
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            "vscode.executeCodeActionProvider",
            document.uri,
            range,
            vscode.CodeActionKind.QuickFix.value
        );
        assert.ok(actions.length > 0);
        const action = actions
            .find((a) => a.title.toLowerCase() === "remove the whole module import");
        assert.ok(action);
        if (action?.edit) {
            await vscode.workspace.applyEdit(action.edit);
        }

        if (action?.command) {
            await vscode.commands.executeCommand(
                action.command.command,
                ...(action.command.arguments ?? [])
            );
        }
        const actualText = document.getText();
        assert.ok(/IMPORTS\s+hahaJustKiddingOtherSymbol/.test(actualText));
    });

    test('Correctly removes an entire duplicate Assignment', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_WITH_DUP_ASSNS,
        });
        const editor = await vscode.window.showTextDocument(document);
        const symbolToDelete: string = "int INTEGER ::= 2";
        // Trigger diagnostics. Quick fixes rely on this.
        await vscode.commands.executeCommand("asn1.diagnose");
        // Just in case this differs from ASN1_BEFORE_SYMBOL_REMOVAL
        const initialText = document.getText();
        const offset = initialText.indexOf(symbolToDelete);
        const start = document.positionAt(offset);
        const end = document.positionAt(offset + symbolToDelete.length);
        const range = new vscode.Selection(start, end);
        const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
            "vscode.executeCodeActionProvider",
            document.uri,
            range,
            vscode.CodeActionKind.QuickFix.value
        );
        assert.ok(actions.length > 0);
        const action = actions
            .find((a) => a.title.toLowerCase() === "remove this assignment");
        assert.ok(action);
        if (action?.edit) {
            await vscode.workspace.applyEdit(action.edit);
        }

        if (action?.command) {
            await vscode.commands.executeCommand(
                action.command.command,
                ...(action.command.arguments ?? [])
            );
        }
        const actualText = document.getText();
        assert.ok(/ModuleName DEFINITIONS ::= BEGIN int INTEGER ::= 1\s+END/.test(actualText));
    });


});
