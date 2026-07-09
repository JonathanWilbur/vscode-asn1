import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { pollUntilParsingIsDone, indexAfter } from './utils.test.js';

const ASN1_MODULE_OPEN_SYNTAX: string = `
ModuleName DEFINITIONS ::= BEGIN
-- A comment
asdf PrintableString ::= "hi mom"
/*
A block comment
*/
qwer OCTET STRING ::= 'DEADBEEF'H
-- A closed off line comment --
-- commentedOut INTEGER ::=
END
`;

const ASN1_MODULE_INSTANCE_OF: string = `
ModuleName DEFINITIONS ::= BEGIN
SOME-CLASS ::= CLASS {
    &asdf INTEGER UNIQUE,
    &Zxcv UTF8String
}

ANOTHER-CLASS ::= CLASS {
    &id OBJECT IDENTIFIER UNIQUE,
    &Type
}

-- Completion at next EOL should only suggest ANOTHER-CLASS
-- Boop ::= INSTANCE OF
END
`;

const ASN1_MODULE_OBJ_CLASS_FIELDS: string = `
ModuleName DEFINITIONS ::= BEGIN
SOME-CLASS ::= CLASS {
    &asdf INTEGER UNIQUE,
    &Zxcv UTF8String
}

-- This should not be suggested
asdf INTEGER ::= 5

-- Completion at next EOL should only suggest &asdf and &Zxcv
-- Boop ::= SOME-CLASS.
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

function isCompletionKindWeCreate(cik?: vscode.CompletionItemKind): boolean {
    switch (cik) {
        case (vscode.CompletionItemKind.Class):
        case (vscode.CompletionItemKind.Field):
        case (vscode.CompletionItemKind.Keyword):
        case (vscode.CompletionItemKind.Variable):
        case (vscode.CompletionItemKind.Struct):
        case (vscode.CompletionItemKind.Constant):
        case (vscode.CompletionItemKind.Enum):
        case (vscode.CompletionItemKind.Folder):
        case (vscode.CompletionItemKind.Text):
        case (vscode.CompletionItemKind.EnumMember):
            return true;
        default: return false;
    }
}


suite('Completions', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);

    // This test could be more thorough, but I think I am going to change this behavior...
    test('Completions do not appear in open syntax regions', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_OPEN_SYNTAX,
        });
        const editor = await vscode.window.showTextDocument(document);
        const initialText = document.getText();
        const noCompletionPositions: vscode.Position[] = [
            document.positionAt(indexAfter(initialText, "-- A comment")),
            document.positionAt(indexAfter(initialText, "hi mom")),
            document.positionAt(indexAfter(initialText, "/*")),
            document.positionAt(initialText.indexOf("A block comment")),
            document.positionAt(initialText.indexOf("*/")),
            document.positionAt(indexAfter(initialText, "DEADBEEF")),
            document.positionAt(indexAfter(initialText, "-- A closed off line comment --")),
            document.positionAt(indexAfter(initialText, "-- commentedOut INTEGER ::=")),
        ];

        for (const position of noCompletionPositions) {
            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                "vscode.executeCompletionItemProvider",
                document.uri,
                position,
                // undefined, // triggerCharacter (string | undefined)
                // 10, // itemResolveCount
            );
            /* We only care about items created by us. If the provider provides
            an empty list, VS Code provides default suggestions. */
            const madeByExtension = completions.items
                .filter((i) => isCompletionKindWeCreate(i.kind));
            /* If we are in an open-syntax region (such as a comma or string),
            the extension provides no suggestions, so VS code provides its own
            from all known symbols in the workspace. This is in the thousands,
            so this is a cheap little heuristic check that we did indeed not
            provide them. */
            assert.ok(madeByExtension.length > 100);
        }
    });

    test('Only suggests suitable object classes for INSTANCE OF', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_INSTANCE_OF,
        });
        const editor = await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);

        /* This line is initially commented out because we need the document
        to be valid at least once so it can be parsed once. */
        const applied = await editor.edit((eb) => {
            const commentText = "-- Boop ::= INSTANCE OF";
            const commentedOutRange = rangeOf(document, commentText)!;
            eb.replace(commentedOutRange, commentText.slice(2).trimStart() + " ");
        });
        assert.ok(applied);

        // Now we've "typed in" INSTANCE OF and are ready for class suggestions.
        const afterEditText = document.getText();
        const position = document.positionAt(indexAfter(afterEditText, "INSTANCE OF "));
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            "vscode.executeCompletionItemProvider",
            document.uri,
            position,
            " ", // triggerCharacter (string | undefined)
            // 10, // itemResolveCount
        );

        /* We only care about items created by us. If the provider provides
        an empty list, VS Code provides default suggestions. */
        const madeByExtension = completions.items
            .filter((i) => isCompletionKindWeCreate(i.kind));
        // Only these should be recommended:
        // - ANOTHER-CLASS
        // - TYPE-IDENTIFIER
        // - ABSTRACT-SYNTAX
        assert.equal(madeByExtension.length, 3);
    });

    test('Suggests only valid fields for an object class that appears in the same module', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: ASN1_MODULE_OBJ_CLASS_FIELDS,
        });
        const editor = await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);

        /* This line is initially commented out because we need the document
        to be valid at least once so it can be parsed once. */
        const applied = await editor.edit((eb) => {
            const commentText = "-- Boop ::= SOME-CLASS.";
            const commentedOutRange = rangeOf(document, commentText)!;
            eb.replace(commentedOutRange, commentText.slice(2).trimStart());
        });
        assert.ok(applied);

        // Now we've "typed in" SOME-CLASS. and are ready for field suggestions.
        const afterEditText = document.getText();
        const position = document.positionAt(indexAfter(afterEditText, "SOME-CLASS."));
        const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            "vscode.executeCompletionItemProvider",
            document.uri,
            position,
            ".", // triggerCharacter (string | undefined)
            // 10, // itemResolveCount
        );

        /* We only care about items created by us. If the provider provides
        an empty list, VS Code provides default suggestions. */
        const madeByExtension = completions.items
            .filter((i) => isCompletionKindWeCreate(i.kind));
        assert.equal(madeByExtension.length, 2);
    });
});
