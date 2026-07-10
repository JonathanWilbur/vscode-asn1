import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { pollUntilParsingIsDone } from './utils.test.js';


const ASN1_FILE: string = `
RenameTestModule DEFINITIONS ::= BEGIN
int1 INTEGER ::= 5
int2 INTEGER ::= int1
blint1 INTEGER ::= 67
END
`;

const ASN1_FILE_AFTER: string = `
RenameTestModule DEFINITIONS ::= BEGIN
int3 INTEGER ::= 5
int2 INTEGER ::= int3
blint1 INTEGER ::= 67
END
`;

suite('Rename', function () {
    this.timeout(10000);
    test('forward and reverse rename gives you the exact same original file', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_FILE,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(document);
        
        // Forward edit
        await pollUntilParsingIsDone(document);
        {
            const text = document.getText();
            const offset = text.indexOf("int1 INTEGER ::= 5") + 2;
            const position = document.positionAt(offset);
            const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
                "vscode.executeDocumentRenameProvider",
                document.uri,
                position,
                "int3"
            );
            await vscode.workspace.applyEdit(edit);
            const textAfter = document.getText();
            assert.equal(textAfter, ASN1_FILE_AFTER);
        }

        // Reverse edit
        await pollUntilParsingIsDone(document);
        {
            const text = document.getText();
            const offset = text.indexOf("int3 INTEGER ::= 5") + 2;
            const position = document.positionAt(offset);
            const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
                "vscode.executeDocumentRenameProvider",
                document.uri,
                position,
                "int1"
            );
            await vscode.workspace.applyEdit(edit);
            const textAfter = document.getText();
            assert.equal(textAfter, ASN1_FILE);
        }
    });

});
