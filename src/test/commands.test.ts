import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Command Test Suite', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('Export All Object Identifiers in Current File to CSV', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const InformationFrameworkUri = vscode.Uri.joinPath(workspaceFolder.uri, "InformationFramework.asn1");
        const InformationFramework = await vscode.workspace.openTextDocument(InformationFrameworkUri);
        await vscode.window.showTextDocument(InformationFramework);
        await vscode.commands.executeCommand("asn1.oid-to-csv.opendoc");
        const csvdoc = vscode.window.activeTextEditor?.document;
        const csvText = csvdoc?.getText();
        // TODO: Better testing here.
        assert.ok(csvText?.includes("id-ar-pwdAdminSpecificArea"));
    });

    // test('Export All Object Identifiers in Current File to CSV #2', async () => {
    //     const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
    //     const outcome = await ext.activate();
    //     await outcome.indexingPromise;
    //     const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    //     assert.ok(workspaceFolder);
    //     const InformationFrameworkUri = vscode.Uri.joinPath(workspaceFolder.uri, "InformationFramework.asn1");
    //     const InformationFramework = await vscode.workspace.openTextDocument(InformationFrameworkUri);
    //     await vscode.window.showTextDocument(InformationFramework);
    //     await vscode.commands.executeCommand("asn1.oid-to-csv.opendoc");
    //     const csvdoc = vscode.window.activeTextEditor?.document;
    //     const csvText = csvdoc?.getText();
    //     assert.ok(csvText?.includes("id-ar-pwdAdminSpecificArea"));
    // });
});
