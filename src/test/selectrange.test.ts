import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { indexAfter, pollUntilParsingIsDone } from './utils.test.js';

const ASN1_FILE: string = `
SelectRangeTest DEFINITIONS ::= BEGIN
ErrorResponse{INTEGER:defaultCode} ::= SEQUENCE {
    code INTEGER DEFAULT defaultCode,
    message UTF8String OPTIONAL }
END
`;

function parentRangesAreAlwaysBigger(selection: vscode.SelectionRange): void {
    if (!selection.parent) {
        return;
    }
    const child = selection.range;
    const parent = selection.parent.range;
    assert.ok(!parent.isEqual(child));
    assert.ok(parent.contains(child));
    parentRangesAreAlwaysBigger(selection.parent);
}

suite('Selection Range', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('for every selection range produced anywhere in the doc, parent is a broader range', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_FILE,
        });
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = indexAfter(text, "code INTEGER DEFAULT defaultCode") - 2;
        const position = document.positionAt(offset);
        const ranges = await vscode.commands.executeCommand<vscode.SelectionRange[]>(
            "vscode.executeSelectionRangeProvider",
            document.uri,
            [position], // Seems to be mis-documented. This takes an array of positions, not one.
        );
        assert.ok(ranges.length > 0);
        for (const range of ranges) {
            parentRangesAreAlwaysBigger(range);
        }
    });

});
