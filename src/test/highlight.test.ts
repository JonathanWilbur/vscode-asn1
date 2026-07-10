import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { indexAfter, pollUntilParsingIsDone } from './utils.test.js';

const ASN1_MODULE_A: string = `
HighlightsTest DEFINITIONS ::= BEGIN
IMPORTS int1 FROM GoToDefA;

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

int3 INTEGER ::= GoToDefA.int2

END
`;

const MULTI_MODULE_TEST: string = `
HighlightsMultiModuleTest1
{ iso 5 4 3 2 1 }
DEFINITIONS ::= BEGIN
int1 INTEGER ::= 1
END
HighlightsMultiModuleTest2 DEFINITIONS ::= BEGIN
IMPORTS int1 FROM HighlightsMultiModuleTest1;
int2 INTEGER ::= int1
END
HighlightsMultiModuleTest3 DEFINITIONS ::= BEGIN
IMPORTS
    int1
    FROM HighlightsMultiModuleTest1
    { iso 5 4 3 2 0 }
    WITH SUCCESSORS
    ;
int3 INTEGER ::= int1
END
HighlightsMultiModuleTest4 DEFINITIONS ::= BEGIN
IMPORTS
    int1
    FROM HighlightsMultiModuleTest1
    { iso 5 4 3 2 }
    WITH DESCENDANTS
    ;
int4 INTEGER ::= int1
END
HighlightsMultiModuleTest5 DEFINITIONS ::= BEGIN
IMPORTS ; -- This is syntactically valid. Just testing.
int5 INTEGER ::= HighlightsMultiModuleTest1.int1
END
HighlightsMultiModuleTest6 DEFINITIONS ::= BEGIN
IMPORTS
    int1
    FROM HighlightsMultiModuleTest1
    { iso 5 4 3 2 1 } -- exact match
    ;
int6 INTEGER ::= int1
END
HighlightsMultiModuleTest7 DEFINITIONS ::= BEGIN
IMPORTS
    int1
    FROM HighlightsMultiModuleTest1
    { iso 5 4 3 2 2 } -- non-match
    ;
int7 INTEGER ::= int1
END
`;

function fourCharsStartingAt(pos: vscode.Position): vscode.Range {
    return new vscode.Range(
        pos,
        new vscode.Position(pos.line, pos.character + 4),
    );
}

suite('Highlights', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('returns expected highlights in a single module', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_A,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = indexAfter(text, "IMPORTS int1") - 2;
        const position = document.positionAt(offset);
        const highlights = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
            "vscode.executeDocumentHighlights",
            document.uri,
            position,
        );
        // We don't care about the kind.
        const expectedRanges: vscode.Range[] = [
            fourCharsStartingAt(new vscode.Position(2, 8)),
            fourCharsStartingAt(new vscode.Position(4, 17)),
            fourCharsStartingAt(new vscode.Position(11, 29)),
            fourCharsStartingAt(new vscode.Position(13, 25)),
            fourCharsStartingAt(new vscode.Position(17, 49)),
        ];
        const ranges = highlights.map((h) => h.range);
        assert.equal(ranges.length, expectedRanges.length);
        for (let i = 0; i < ranges.length; i++) {
            assert.ok(ranges[i].isEqual(expectedRanges[i]));
        }
    });

    test('returns expected highlights in a multi-module file', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: MULTI_MODULE_TEST,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = text.indexOf("int1 INTEGER ::= 1") + 2;
        const position = document.positionAt(offset);
        const highlights = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
            "vscode.executeDocumentHighlights",
            document.uri,
            position,
        );
        // We don't care about the kind, just ranges.
        const actualRanges = highlights.map((h) => h.range);
        const expectedRanges: vscode.Range[] = [
            fourCharsStartingAt(new vscode.Position(4, 0)),
            fourCharsStartingAt(new vscode.Position(7, 8)),
            fourCharsStartingAt(new vscode.Position(8, 17)),
            fourCharsStartingAt(new vscode.Position(12, 4)),
            fourCharsStartingAt(new vscode.Position(17, 17)),
            fourCharsStartingAt(new vscode.Position(21, 4)),
            fourCharsStartingAt(new vscode.Position(26, 17)),
            fourCharsStartingAt(new vscode.Position(30, 44)), // The HighlightsMultiModuleTest1.int1 usage
            fourCharsStartingAt(new vscode.Position(34, 4)),
            fourCharsStartingAt(new vscode.Position(38, 17)),
        ];
        assert.equal(actualRanges.length, expectedRanges.length);
        for (let i = 0; i < actualRanges.length; i++) {
            assert.ok(actualRanges[i].isEqual(expectedRanges[i]));
        }
    });

});
