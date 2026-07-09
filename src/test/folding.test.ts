import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { pollUntilParsingIsDone } from './utils.test.js';

const ASN1_MODULE_A: string = `
FoldingModule DEFINITIONS ::= BEGIN

Seq1 ::= SEQUENCE {
    asdf INTEGER
}

Seq2 ::= SEQUENCE {
    asdf INTEGER
}

-- This should not get a folding range, because it is a single line.
int INTEGER ::= 6
END
`;

suite('Folding Ranges', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(15000);
    test('provides as many folding ranges are there are multi-line assignments + 1', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        await pollUntilParsingIsDone(document);
        const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            "vscode.executeFoldingRangeProvider",
            document.uri,
        );
        assert.equal(ranges.length, 3);

        // Cleanup
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
    // just check that there is N assignments + 1 for the module
});
