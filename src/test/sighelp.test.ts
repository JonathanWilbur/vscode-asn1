import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { indexAfter, pollUntilParsingIsDone } from './utils.test.js';

const ASN1_FILE: string = `
SigHelpTest DEFINITIONS ::= BEGIN

-- Single type parameter
SignedMessage{T} ::= SEQUENCE {
    signedThing T,
    algorithm INTEGER }

-- Multiple type parameters
Bridge{T, U} ::= SEQUENCE { from T, to U }

-- Parameter with governor
ErrorResponse{INTEGER:defaultCode} ::= SEQUENCE {
    code INTEGER DEFAULT defaultCode,
    message UTF8String OPTIONAL }

-- REPLACE_ME
END
`;

function rangeOf(
    document: vscode.TextDocument,
    needle: string,
): vscode.Range | null {
    const haystack = document.getText();
    const i = haystack.indexOf(needle);
    if (i < 0) {
        return null;
    }
    const start = document.positionAt(i);
    const end = document.positionAt(i + needle.length);
    return new vscode.Range(start, end);
}

function verifyTwoParameters(
    signature: vscode.SignatureInformation,
): void {
    assert.ok(signature.label.includes("{T, U}"));
    assert.equal(signature.parameters.length, 2);

    const parameter1 = signature.parameters[0];
    if (typeof parameter1.label === "string") {
        assert.equal(parameter1.label, "T");
    } else {
        const [start, end] = parameter1.label;
        const label = signature.label.slice(start, end);
        assert.equal(label, "T");
    }

    const parameter2 = signature.parameters[1];
    if (typeof parameter2.label === "string") {
        assert.equal(parameter2.label, "U");
    } else {
        const [start, end] = parameter2.label;
        const label = signature.label.slice(start, end);
        assert.equal(label, "U");
    }
}

suite('Signature Help', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('works with a single type parameter', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_FILE,
        });
        const editor = await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);

        /* This line is initially commented out because we need the document
        to be valid at least once so it can be parsed once. */
        const applied = await editor.edit((eb) => {
            const commentedOutRange = rangeOf(document, "-- REPLACE_ME")!;
            eb.replace(commentedOutRange, "SignedHello ::= SignedMessage{");
        });
        assert.ok(applied);
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = indexAfter(text, "SignedHello ::= SignedMessage{");
        const position = document.positionAt(offset);
        const sighelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
            "vscode.executeSignatureHelpProvider",
            document.uri,
            position,
            "{",
        );
        assert.equal(sighelp.activeParameter, 0);
        assert.equal(sighelp.activeSignature, 0);
        assert.equal(sighelp.signatures.length, 1);
        const signature = sighelp.signatures[0];
        assert.ok(signature.label.includes("{T}"));
        assert.equal(signature.parameters.length, 1);
        const parameter = signature.parameters[0];
        if (typeof parameter.label === "string") {
            assert.equal(parameter.label, "T");
        } else {
            const [start, end] = parameter.label;
            const label = signature.label.slice(start, end);
            assert.equal(label, "T");
        }
    });

    test('works with multiple type parameters', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_FILE,
        });
        const editor = await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);

        /* This line is initially commented out because we need the document
        to be valid at least once so it can be parsed once. */
        const applied = await editor.edit((eb) => {
            const commentedOutRange = rangeOf(document, "-- REPLACE_ME")!;
            eb.replace(commentedOutRange, "IntStringBridge ::= Bridge{");
        });
        assert.ok(applied);
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = indexAfter(text, "IntStringBridge ::= Bridge{");
        const position = document.positionAt(offset);
        const sighelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
            "vscode.executeSignatureHelpProvider",
            document.uri,
            position,
            "{",
        );
        assert.equal(sighelp.activeParameter, 0);
        assert.equal(sighelp.activeSignature, 0);
        assert.equal(sighelp.signatures.length, 1);
        const signature = sighelp.signatures[0];
        verifyTwoParameters(signature);
        const replaceRange = rangeOf(document, "IntStringBridge ::= Bridge{")!;
        const secondParamLine = "IntStringBridge ::= Bridge{INTEGER,";
        const applied2 = await editor.edit((eb) => {
            eb.replace(replaceRange, secondParamLine);
        });
        assert.ok(applied2);
        const sighelp2 = await vscode.commands.executeCommand<vscode.SignatureHelp>(
            "vscode.executeSignatureHelpProvider",
            document.uri,
            new vscode.Position(replaceRange.start.line, secondParamLine.length),
            ",",
        );
        assert.equal(sighelp2.activeParameter, 1);
        assert.equal(sighelp2.activeSignature, 0);
        assert.equal(sighelp2.signatures.length, 1);
        const signature2 = sighelp2.signatures[0];
        verifyTwoParameters(signature2);
        assert.equal(signature2.activeParameter, 1);
    });

    test('works with a single type parameter with a governor', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_FILE,
        });
        const editor = await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);

        /* This line is initially commented out because we need the document
        to be valid at least once so it can be parsed once. */
        const applied = await editor.edit((eb) => {
            const commentedOutRange = rangeOf(document, "-- REPLACE_ME")!;
            eb.replace(commentedOutRange, "BoofyError ::= ErrorResponse{");
        });
        assert.ok(applied);
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = indexAfter(text, "BoofyError ::= ErrorResponse{");
        const position = document.positionAt(offset);
        const sighelp = await vscode.commands.executeCommand<vscode.SignatureHelp>(
            "vscode.executeSignatureHelpProvider",
            document.uri,
            position,
            "{",
        );
        assert.equal(sighelp.activeParameter, 0);
        assert.equal(sighelp.activeSignature, 0);
        assert.equal(sighelp.signatures.length, 1);
        const signature = sighelp.signatures[0];
        assert.ok(signature.label.includes("{INTEGER:defaultCode}"));
        assert.equal(signature.parameters.length, 1);
        const parameter = signature.parameters[0];
        if (typeof parameter.label === "string") {
            assert.equal(parameter.label, "INTEGER:defaultCode");
        } else {
            const [start, end] = parameter.label;
            const label = signature.label.slice(start, end);
            assert.equal(label, "INTEGER:defaultCode");
        }
    });

});
