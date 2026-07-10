import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { indexAfter, pollUntilParsingIsDone } from './utils.test.js';

const GOTODEF_MODULE: string = `
GoToDefModule DEFINITIONS ::= BEGIN
int1 INTEGER ::= 5
int2 INTEGER ::= int1
END
`;

const DEFINING_MODULE: string = `
GoToDefDefiningModule DEFINITIONS ::= BEGIN
int1 INTEGER ::= 5
int2 INTEGER ::= int1
END
`;

const REFERRING_MODULE: string = `
GoToDefReferringModule DEFINITIONS ::= BEGIN
IMPORTS int1 FROM GoToDefDefiningModule;
int2 INTEGER ::= int1

ErrorResponse{INTEGER:defaultCode} ::= SEQUENCE {
    code INTEGER DEFAULT defaultCode,
    message UTF8String OPTIONAL
}

BoofyError ::= ErrorResponse{int1}

CoolNumbers INTEGER ::= {int1 | int2, ...}

MESSAGE ::= TYPE-IDENTIFIER

msg1 MESSAGE ::= { PrintableString IDENTIFIED BY int1 }

END
`;

// Written by ChatGPT
function* findRanges(haystack: string, needle: string): IterableIterator<[number, number], void> {
    if (needle.length === 0) {
        throw new Error("Needle must not be empty.");
    }
    let start = 0;
    while (true) {
        const index = haystack.indexOf(needle, start);
        if (index === -1) {
            return;
        }
        yield [index, index + needle.length];
        start = index + needle.length;
    }
}

suite('Go to Definition', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('Go to definition for a symbol works within a single module', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const doca = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: GOTODEF_MODULE,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(doca);
        await pollUntilParsingIsDone(doca);
        const texta = doca.getText();
        const offset = indexAfter(texta, "int2 INTEGER ::= int1") - 2;
        const position = doca.positionAt(offset);
        const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
            "vscode.executeDefinitionProvider",
            doca.uri,
            position,
        );
        assert.equal(locations.length, 1);
        const locOrLink = locations[0];
        if (!(locOrLink instanceof vscode.Location)) {
            assert.fail("not a location");
        }
        const loc: vscode.Location = locOrLink;
        const expectedRange = new vscode.Range(
            new vscode.Position(2, 0),
            new vscode.Position(2, 18),
        );
        assert.ok(loc.range.isEqual(expectedRange));
    });

    test('Go to definition for a symbol works across modules', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const definingDoc = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: DEFINING_MODULE,
        });
        const referringDoc = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: REFERRING_MODULE,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(definingDoc);
        await vscode.window.showTextDocument(referringDoc);
        await pollUntilParsingIsDone(definingDoc);
        await pollUntilParsingIsDone(referringDoc);
        const referringText = referringDoc.getText();
        
        for (const [start] of findRanges(referringText, "int1")) {
            const position = referringDoc.positionAt(start + 2);
            const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                "vscode.executeDefinitionProvider",
                referringDoc.uri,
                position,
            );
            assert.equal(locations.length, 1);
            const locOrLink = locations[0];
            if (!(locOrLink instanceof vscode.Location)) {
                assert.fail("not a location");
            }
            const loc: vscode.Location = locOrLink;
            const expectedRange = new vscode.Range(
                new vscode.Position(2, 0),
                new vscode.Position(2, 18),
            );
            assert.equal(loc.uri.toString(), definingDoc.uri.toString());
            assert.ok(loc.range.isEqual(expectedRange));
        }
    });

});
