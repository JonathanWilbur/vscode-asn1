import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { pollUntilParsingIsDone } from './utils.test.js';

const ASN1_FILE: string = `
HoverTest1 DEFINITIONS ::= BEGIN
ErrorResponse{INTEGER:defaultCode} ::= SEQUENCE {
    code INTEGER DEFAULT defaultCode,
    message UTF8String OPTIONAL
}
END
HoverTest2 DEFINITIONS ::= BEGIN
IMPORTS ErrorResponse{} FROM HoverTest1;
MyResponse ::= ErrorResponse{5}
END
`;

suite('Hover', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);
    test('shows the definition of a DefinedType', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_FILE,
        });
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);
        const text = document.getText();
        const offset = text.indexOf("ErrorResponse{5}") + 2;
        const position = document.positionAt(offset);
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            "vscode.executeHoverProvider",
            document.uri,
            position,
        );
        assert.equal(hovers.length, 1);
        const hover = hovers[0];
        assert.ok(hover.contents.length > 0);
        const contentStrings = hover
            .contents
            .map((content) => {
                if (content instanceof vscode.MarkdownString) {
                    return content.value;
                } else {
                    return content.toString();
                }
            });
        const matchingContent = contentStrings
            .find((content) => content.includes("UTF8String"));
        assert.ok(matchingContent);
    });

});
