import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { pollUntilParsingIsDone } from './utils.test.js';

const ASN1_MODULE_A: string = `
ModuleA DEFINITIONS ::= BEGIN
int1 INTEGER ::= 5
int2 INTEGER ::= int1
END
`;

const ASN1_MODULE_B: string = `
ModuleB DEFINITIONS ::= BEGIN
IMPORTS int1 FROM ModuleA;
int2 INTEGER ::= int1

ErrorResponse{INTEGER:defaultCode} ::= SEQUENCE {
    code INTEGER DEFAULT defaultCode,
    message UTF8String OPTIONAL
}

BoofyError ::= ErrorResponse{int1}

CoolNumbers INTEGER ::= {int1 | int2, ...}

MESSAGE ::= TYPE-IDENTIFIER

msg1 MESSAGE ::= { PrintableString IDENTIFIED BY int1 }

-- This should NOT match, despite the substring.
blint1 INTEGER ::= 4

int3 INTEGER ::= ModuleA.int2

END
`;

suite('Find All References', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('Can find references for an assignment at the assignment itself', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        const docb = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_B,
        });
        await vscode.window.showTextDocument(docb);
        await pollUntilParsingIsDone(doca);
        await pollUntilParsingIsDone(docb);
        const texta = doca.getText();
        const offset = texta.indexOf("int1");
        const position = doca.positionAt(offset + 1);
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            doca.uri,
            position,
        );
        assert.equal(references.length, 7);

        // Cleanup
        await vscode.window.showTextDocument(doca);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(docb);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Can find references for an assignment by clicking on its import', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        await vscode.window.showTextDocument(doca);
        const docb = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_B,
        });
        await vscode.window.showTextDocument(docb);
        await pollUntilParsingIsDone(doca);
        await pollUntilParsingIsDone(docb);
        const textb = docb.getText();
        const offset = textb.indexOf("IMPORTS int1");
        const position = docb.positionAt(offset + "IMPORTS ".length + 1);
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            docb.uri,
            position,
        );
        assert.equal(references.length, 7);

        // Cleanup
        await vscode.window.showTextDocument(doca);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(docb);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Can find references for an assignment by clicking on its usage in an importing module', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        await vscode.window.showTextDocument(doca);
        const docb = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_B,
        });
        await vscode.window.showTextDocument(docb);
        await pollUntilParsingIsDone(doca);
        await pollUntilParsingIsDone(docb);
        const textb = docb.getText();
        const offset = textb.indexOf("{int1 |");
        const position = docb.positionAt(offset + 2);
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            docb.uri,
            position,
        );
        assert.equal(references.length, 7);

        // Cleanup
        await vscode.window.showTextDocument(doca);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(docb);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Can find references for a module by clicking on its own name', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        const docb = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_B,
        });
        await vscode.window.showTextDocument(docb);
        await pollUntilParsingIsDone(doca);
        await pollUntilParsingIsDone(docb);
        const texta = doca.getText();
        const offset = texta.indexOf("ModuleA");
        const position = doca.positionAt(offset + 1);
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            doca.uri,
            position,
        );
        assert.equal(references.length, 3);

        // Cleanup
        await vscode.window.showTextDocument(doca);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(docb);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Can find references for a module by clicking on its import', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        await vscode.window.showTextDocument(doca);
        const docb = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_B,
        });
        await vscode.window.showTextDocument(docb);
        await pollUntilParsingIsDone(doca);
        await pollUntilParsingIsDone(docb);
        const textb = docb.getText();
        const offset = textb.indexOf("FROM ModuleA");
        const position = docb.positionAt(offset + 6);
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            docb.uri,
            position,
        );
        assert.equal(references.length, 3);

        // Cleanup
        await vscode.window.showTextDocument(doca);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(docb);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    test('Can find references for a module by clicking on its usage in an ExternalValueReference', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        await vscode.window.showTextDocument(doca);
        const docb = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_B,
        });
        await vscode.window.showTextDocument(docb);
        await pollUntilParsingIsDone(doca);
        await pollUntilParsingIsDone(docb);
        const textb = docb.getText();
        const offset = textb.indexOf("ModuleA.int2");
        const position = docb.positionAt(offset + 2);
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            "vscode.executeReferenceProvider",
            docb.uri,
            position,
        );
        assert.equal(references.length, 3);

        // Cleanup
        await vscode.window.showTextDocument(doca);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        await vscode.window.showTextDocument(docb);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

});
