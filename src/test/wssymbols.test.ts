import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { fuzzyMatch } from "../wssymbols.js";

// This was all written by Cursor AI.
suite("fuzzyMatch", () => {
    test("matches query characters in order within symbol", () => {
        const matches = [
            ["abc", "a_b_c"],
            ["abc", "alphabetic"],
            ["cmp", "completionitem"],
            ["vsc", "visualstudiocode"],
            ["cat", "cart"],
        ];
        for (const [query, symbol] of matches) {
            assert.strictEqual(fuzzyMatch(query, symbol), true);
        }
    });

    test("rejects query characters out of order or missing", () => {
        const nonMatches = [
            ["cta", "cart"],
            ["xyz", "completion"],
        ];
        for (const [query, symbol] of nonMatches) {
            assert.strictEqual(fuzzyMatch(query, symbol), false);
        }
    });
});

const ASN1_MODULE_A: string = `
WsSymbolsTest1 DEFINITIONS ::= BEGIN
IMPORTS int1 FROM SymbolsA;

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

int3 INTEGER ::= SymbolsA.int2

END
`;

const ASN1_MODULE_B: string = `
WsSymbolsTest2 DEFINITIONS ::= BEGIN
IMPORTS importedThing FROM SomeOtherModule;

boop BOOLEAN ::= FALSE

beep BOOLEAN ::= TRUE

END
`;

suite('Workspace Symbols', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);
    test('provides symbols for the open document and one other', async () => {
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
        await vscode.window.showTextDocument(doca);
        await vscode.window.showTextDocument(docb);

        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            "vscode.executeWorkspaceSymbolProvider",
            "boo"
        );

        assert.equal(symbols.length, 2);
        const sortedByIncreasingNameLength = symbols
            .sort((a, b) => a.name.length - b.name.length);
        const boop = sortedByIncreasingNameLength[0];
        const BoofyError = sortedByIncreasingNameLength[1];
        assert.equal(boop.name, "boop");
        assert.equal(BoofyError.name, "BoofyError");

        // Remember: the range is the entire assignment.
        const expectedBoopRange = new vscode.Range(
            new vscode.Position(4, 0),
            new vscode.Position(4, 22),
        );
        const expectedBoofyErrorRange = new vscode.Range(
            new vscode.Position(11, 0),
            new vscode.Position(11, 34),
        );

        assert.ok(boop.location.range.isEqual(expectedBoopRange));
        assert.ok(BoofyError.location.range.isEqual(expectedBoofyErrorRange));
    });
});
