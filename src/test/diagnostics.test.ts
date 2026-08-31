import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import {
    DIAG_CODE_IMPORT_SYMBOL_DUP,
    DIAG_CODE_IMPORT_SYMBOL_UNUSED,
    DIAG_CODE_ASSIGNMENT_DUP,
    // DIAG_CODE_NAMED_NUM_OR_BIT_DUP,
    // DIAG_CODE_NAMED_BIT_OR_ENUM_NEG,
    // DIAG_CODE_ENUM_NUM_DUP,
    DIAG_CODE_COMPS_OF_NOT_TYPE,
    DIAG_CODE_COMPS_OF_WRONG_TYPE,
    DIAG_CODE_SET_OR_SEQ_COMP_DUP,
    DIAG_CODE_CHOICE_ALT_DUP,
    // DIAG_CODE_SHORT_OID,
    DIAG_CODE_OID_ROOT_ARC_NUM,
    DIAG_CODE_OID_ROOT_ARC_NAME,
    DIAG_CODE_OID_ROOT_ARC_MISMATCH,
    DIAG_CODE_OID_BIG_SECOND_ARC,
    DIAG_CODE_DATE_INVALID,
    DIAG_CODE_DATE_DAY_INVALID,
    DIAG_CODE_TIME_OF_DAY_INVALID,
    DIAG_CODE_DATETIME_INVALID,
    DIAG_CODE_DURATION_NO_P,
    // DIAG_CODE_VAL_ASSN_TYPE_NOT_TYPE,
    DIAG_CODE_SYMBOL_NOT_DEFINED,
    DIAG_CODE_EXPORT_NOT_DEFINED,
    // DIAG_CODE_LEX_ERROR,
    // DIAG_CODE_PARSE_ERROR,
    // DIAG_CODE_GROK_ERROR,
    // DIAG_CODE_DIAG_DISABLED,
    DIAG_CODE_PROHIBITED_CHAR,
    DIAG_CODE_PARAM_SYMBOL_UNUSED,
    DIAG_CODE_IMPORT_MODULE_DUP,
    // DIAG_CODE_PARAMETER_DUP,
    DIAG_CODE_IMPORT_MODULE_UNUSED,
} from "../diagnostics.js";
import { pollUntilParsingIsDone } from './utils.test.js';

const DIAGNOSTICS_TEST_FILE: string = "DiagnosticsTest.asn1";

/**
 * Two modules in one file: the importing module uses `ENUMERATED` variants
 * from the defining module's information object class without importing them.
 *
 * `directoryOperationOrphan` is a made-up identifier so the value-assignment
 * case is distinguishable from the legitimate `directoryOperation` variant.
 */
const IMPLICIT_ENUM_IMPORT_ASN1: string = `
ImplicitEnumDefining DEFINITIONS ::= BEGIN

AttributeUsage ::= ENUMERATED {
    userApplications (0),
    directoryOperation (1)
}

OtherUsage ::= ENUMERATED {
    userApplications (0),
    somethingElse (1)
}

USAGE-CLASS ::= CLASS {
    &usage AttributeUsage DEFAULT userApplications,
    &id OBJECT IDENTIFIER UNIQUE
} WITH SYNTAX {
    [USAGE &usage]
    ID &id
}

OTHER-CLASS ::= CLASS {
    &usage OtherUsage DEFAULT somethingElse,
    &id OBJECT IDENTIFIER UNIQUE
} WITH SYNTAX {
    [USAGE &usage]
    ID &id
}

INLINE-CLASS ::= CLASS {
    &kind ENUMERATED { abstract (0), structural (1) } DEFAULT structural,
    &id OBJECT IDENTIFIER UNIQUE
} WITH SYNTAX {
    [KIND &kind]
    ID &id
}

id-a OBJECT IDENTIFIER ::= { joint-iso-itu-t(2) 2 3 }
id-b OBJECT IDENTIFIER ::= { joint-iso-itu-t(2) 2 4 }
id-c OBJECT IDENTIFIER ::= { joint-iso-itu-t(2) 2 5 }

END

ImplicitEnumImporting DEFINITIONS ::= BEGIN

IMPORTS
    USAGE-CLASS, OTHER-CLASS, INLINE-CLASS, id-a, id-b, id-c
        FROM ImplicitEnumDefining;

-- Should NOT be flagged: implicit enum import via defined syntax
obj1 USAGE-CLASS ::= {
    USAGE directoryOperation
    ID id-a
}

-- Should NOT be flagged: implicit enum import via default syntax
obj2 USAGE-CLASS ::= {
    &usage userApplications,
    &id id-b
}

-- Should NOT be flagged: inline ENUMERATED in the object class
obj3 INLINE-CLASS ::= {
    KIND abstract
    ID id-c
}

-- Should be flagged: variant belongs to OTHER-CLASS, not USAGE-CLASS
obj4 USAGE-CLASS ::= {
    USAGE somethingElse
    ID id-a
}

-- Should be flagged: not an enum variant at all
obj5 USAGE-CLASS ::= {
    USAGE totallyUnknown
    ID id-a
}

-- Should be flagged: enum-like identifier used outside an information object
orphan INTEGER ::= directoryOperationOrphan

END
`;


suite('Diagnostics', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    // this.timeout(10000);
    test('Provides correct diagnostics for in DiagnosticsTest.asn1', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, DIAGNOSTICS_TEST_FILE);
        const document = await vscode.workspace.openTextDocument(fileUri);
        // Seems to be necessary for asn1.parsed-version to work. Not sure why.
        await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);
        const actualDiagnostics = vscode.languages.getDiagnostics(fileUri);
        assert.ok(actualDiagnostics.length > 0);
        const diagCodesExpected: Map<string, number | null> = new Map([
            [ DIAG_CODE_IMPORT_SYMBOL_DUP, 1 ],
            [ DIAG_CODE_IMPORT_SYMBOL_UNUSED, 1 ],
            [ DIAG_CODE_ASSIGNMENT_DUP, 1 ],
            // [ DIAG_CODE_NAMED_NUM_OR_BIT_DUP, 3 ], (Unavailable to due to parsing failure prior.)
            // [ DIAG_CODE_NAMED_BIT_OR_ENUM_NEG, 2 ], (Unavailable to due to parsing failure prior.)
            // [ DIAG_CODE_ENUM_NUM_DUP, 1 ], (Unavailable to due to parsing failure prior.)
            [ DIAG_CODE_COMPS_OF_NOT_TYPE, 1 ],
            [ DIAG_CODE_COMPS_OF_WRONG_TYPE, 2 ],
            [ DIAG_CODE_SET_OR_SEQ_COMP_DUP, 1 ],
            [ DIAG_CODE_CHOICE_ALT_DUP, 1 ],
            // [ DIAG_CODE_SHORT_OID, 1 ], (Unavailable to due to parsing failure prior.)
            [ DIAG_CODE_OID_ROOT_ARC_NUM, 1 ],
            [ DIAG_CODE_OID_ROOT_ARC_NAME, 1 ],
            [ DIAG_CODE_OID_ROOT_ARC_MISMATCH, 2 ],
            [ DIAG_CODE_OID_BIG_SECOND_ARC, 1 ],
            [ DIAG_CODE_DATE_INVALID, 1 ],
            [ DIAG_CODE_DATE_DAY_INVALID, 1 ],
            [ DIAG_CODE_TIME_OF_DAY_INVALID, 1 ],
            [ DIAG_CODE_DATETIME_INVALID, 1 ],
            [ DIAG_CODE_DURATION_NO_P, 1 ],
            // [ DIAG_CODE_VAL_ASSN_TYPE_NOT_TYPE, 1 ], (Unavailable to due to parsing failure prior.)
            [ DIAG_CODE_SYMBOL_NOT_DEFINED, 1 ],
            [ DIAG_CODE_EXPORT_NOT_DEFINED, 1 ],
            [ DIAG_CODE_PROHIBITED_CHAR, 2 ],
            [ DIAG_CODE_PARAM_SYMBOL_UNUSED, 1 ],
            [ DIAG_CODE_IMPORT_MODULE_DUP, 1 ],
            // [ DIAG_CODE_PARAMETER_DUP, 1 ],
            [ DIAG_CODE_IMPORT_MODULE_UNUSED, 1 ],
        ]);
        for (const diag of actualDiagnostics) {
            assert.ok(diag.code);
            assert.ok(typeof diag.code === "string");
            const expectation = diagCodesExpected.get(diag.code);
            if (typeof expectation === "undefined") {
                assert.fail("unexpected diagnostic: " + diag.code);
            } else if (typeof expectation === "object" && !expectation) {
                continue;
            } else if (typeof expectation === "number") {
                if (expectation <= 1) {
                    diagCodesExpected.delete(diag.code);
                } else {
                    diagCodesExpected.set(diag.code, expectation - 1);
                }
            } else {
                assert.fail("unexpected expectation type " + (typeof expectation));
            }
        }

        // Check for diagnostics not provided
        for (const [code, expectation] of diagCodesExpected.entries()) {
            if (typeof expectation === "number" && expectation > 0) {
                assert.fail("diagnostic missing: " + code);
            }
        }
    });

    test('Does not flag implicitly imported ENUMERATED variants in information objects', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const document = await vscode.workspace.openTextDocument({
            language: "asn1",
            content: IMPLICIT_ENUM_IMPORT_ASN1,
        });
        await vscode.window.showTextDocument(document);
        await pollUntilParsingIsDone(document);
        await vscode.commands.executeCommand("asn1.diagnose", document.uri);
        const actualDiagnostics = vscode.languages.getDiagnostics(document.uri);
        const undefinedSymbols = actualDiagnostics
            .filter((diag) => diag.code === DIAG_CODE_SYMBOL_NOT_DEFINED)
            .map((diag) => document.getText(diag.range));

        for (const allowed of [
            "directoryOperation",
            "userApplications",
            "abstract",
        ]) {
            assert.ok(
                !undefinedSymbols.includes(allowed),
                `implicitly imported ENUMERATED variant ${allowed} was flagged as unimported: ${undefinedSymbols.join(", ")}`,
            );
        }

        for (const expected of [
            "somethingElse",
            "totallyUnknown",
            "directoryOperationOrphan",
        ]) {
            assert.ok(
                undefinedSymbols.includes(expected),
                `expected unimported symbol ${expected} was not flagged; got: ${undefinedSymbols.join(", ")}`,
            );
        }
    });

});
