import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { pollUntilParsingIsDone } from './utils.test.js';

const ASN1_MODULE_A: string = `
SymbolsTest DEFINITIONS ::= BEGIN
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

suite('Document Symbols', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);
    test('provides one symbol for each assignment', async () => {
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
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            "vscode.executeDocumentSymbolProvider",
            document.uri,
        );
        assert.equal(symbols.length, 1); // one for the module
        const modsymbol = symbols[0];
        assert.equal(modsymbol.children.length, 9); // one import and eight assignments
    });
});
