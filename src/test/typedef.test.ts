import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { indexAfter, pollUntilParsingIsDone } from './utils.test.js';


const ASN1_DEFINING_MODULE: string = `
TypeDefiningModule DEFINITIONS ::= BEGIN
BoopID ::= INTEGER
MY-CLASS ::= TYPE-IDENTIFIER
END
`;

const ASN1_REFERRING_MODULE: string = `
TypeReferringModule DEFINITIONS ::= BEGIN
IMPORTS BoopID, MY-CLASS FROM TypeDefiningModule;
int1 BoopID ::= 5
int2 BoopID ::= int1
obj MY-CLASS ::= { UTF8String IDENTIFIED BY { joint-iso-itu-t 5 4 3 } }
Boops BoopID ::= {int1, ...}
Objects MY-CLASS ::= {obj, ...}
END
`;

const COMBINED_TYPEDEF_MODULE: string = `
CombinedTypeDefModule1 DEFINITIONS ::= BEGIN
BoopID ::= INTEGER
MY-CLASS ::= TYPE-IDENTIFIER
int1 BoopID ::= 5
int2 BoopID ::= int1
obj MY-CLASS ::= { UTF8String IDENTIFIED BY { joint-iso-itu-t 5 4 3 } }
Boops BoopID ::= {int1, ...}
Objects MY-CLASS ::= {obj, ...}
END
`;

const BOOP_RANGE = new vscode.Range(
    new vscode.Position(2, 0),
    new vscode.Position(2, 18),
);

const MY_CLASS_RANGE = new vscode.Range(
    new vscode.Position(3, 0),
    new vscode.Position(3, 28),
);

async function check(
    document: vscode.TextDocument,
    position: vscode.Position,
    expectedRange: vscode.Range,
): Promise<void> {
    const locations = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        "vscode.executeTypeDefinitionProvider",
        document.uri,
        position,
    );
    assert.equal(locations.length, 1);
    const locOrLink = locations[0];
    if (!(locOrLink instanceof vscode.Location)) {
        assert.fail("not a location");
    }
    const loc: vscode.Location = locOrLink;
    assert.ok(loc.range.isEqual(expectedRange));
}

// These tests currently depend on the types being at the same place
async function checkFile(
    document: vscode.TextDocument,
): Promise<void> {
    await pollUntilParsingIsDone(document);
    const text = document.getText();

    // Clicking on the value assignment identifier
    {
        const offset = text.indexOf("int1 BoopID") + 2;
        const position = document.positionAt(offset);
        await check(document, position, BOOP_RANGE);
    }

    // Clicking on the defined value in another assignment
    {
        const offset = indexAfter(text, "int2 BoopID ::= int1") - 2;
        const position = document.positionAt(offset);
        await check(document, position, BOOP_RANGE);
    }

    // Clicking on the object assignment identifier
    {
        const offset = text.indexOf("obj MY-CLASS") + 2;
        const position = document.positionAt(offset);
        await check(document, position, MY_CLASS_RANGE);
    }

    // Clicking on the defined object in another assignment
    {
        const offset = text.indexOf("{obj, ...}") + 2;
        const position = document.positionAt(offset);
        await check(document, position, MY_CLASS_RANGE);
    }

    // Clicking on the value set assignment identifier
    {
        const offset = text.indexOf("Boops BoopID") + 2;
        const position = document.positionAt(offset);
        await check(document, position, BOOP_RANGE);
    }

    // Clicking on the object set assignment identifier
    {
        const offset = text.indexOf("Objects MY-CLASS") + 2;
        const position = document.positionAt(offset);
        await check(document, position, MY_CLASS_RANGE);
    }
}

suite('Go to Type Definition', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('goes to the right type in the same module', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: COMBINED_TYPEDEF_MODULE,
        });
        await pollUntilParsingIsDone(document);
        await checkFile(document);
    });

    test('goes to the right type across modules', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_DEFINING_MODULE + ASN1_REFERRING_MODULE,
        });
        await checkFile(document);
    });

});
