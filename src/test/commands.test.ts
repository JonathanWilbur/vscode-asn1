import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { parse as parseCSV } from "@std/csv/parse";
import { ASSNS_CSV_HEADERS, DEPS_CSV_HEADERS, MODS_CSV_HEADERS, OID_CSV_HEADERS } from '../commands.js';

suite('Command Test Suite', function () {
    // You have to use a regular function (not arrow) for `this` to be defined properly.
    this.timeout(10000);
    test('Export All Object Identifiers in Current File to CSV', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const InformationFrameworkUri = vscode.Uri.joinPath(workspaceFolder.uri, "InformationFramework.asn1");
        const InformationFramework = await vscode.workspace.openTextDocument(InformationFrameworkUri);
        await vscode.window.showTextDocument(InformationFramework);
        await vscode.commands.executeCommand("asn1.oid-to-csv.opendoc");
        const csvdoc = vscode.window.activeTextEditor?.document;
        assert.ok(csvdoc);
        const csvText = csvdoc.getText();
        assert.ok(csvText.includes("id-ar-pwdAdminSpecificArea"));
        const rows = parseCSV(csvText, {
            skipFirstRow: true,
            columns: OID_CSV_HEADERS,
        });
        assert.ok(rows.length > 0);
        for (const row of rows) {
            assert.ok(row["OID_SOURCE"] === "ASSIGNMENT" || row["OID_SOURCE"] === "MODULE");
            assert.equal(row["MODULE_NAME"], "InformationFramework");
            assert.ok(/[0-9\.]+/.test(row["MODULE_OID"]));
            assert.ok(row["MODULE_IRI"].length === 0 || row["MODULE_IRI"].startsWith("/"));
            assert.ok(/[0-9\.]+/.test(row["OID_NUM"]));
            assert.ok(row["OID_ASN1"].startsWith("{"));
            assert.ok(row["OID_ASN1"].endsWith("}"));
            assert.equal(row["OID_IRI"].charAt(0), "/");
            assert.ok(/[A-Za-z0-9\-]*/.test(row["ASSIGNMENT_NAME"]));
            assert.ok(/[A-Za-z0-9\-]*/.test(row["LAST_ARC_NAME"]));
            assert.ok(/\d+/.test(row["LAST_ARC_NUM"]));
        }
    });

    test('Export All ASN.1 Imports and Exports in Current File to CSV', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const InformationFrameworkUri = vscode.Uri.joinPath(workspaceFolder.uri, "InformationFramework.asn1");
        const InformationFramework = await vscode.workspace.openTextDocument(InformationFrameworkUri);
        await vscode.window.showTextDocument(InformationFramework);
        await vscode.commands.executeCommand("asn1.deps-to-csv.opendoc");
        const csvdoc = vscode.window.activeTextEditor?.document;
        assert.ok(csvdoc);
        const csvText = csvdoc.getText();
        assert.ok(csvText.includes("SearchRule"));
        const rows = parseCSV(csvText, {
            skipFirstRow: true,
            columns: DEPS_CSV_HEADERS,
        });
        assert.ok(rows.length > 0);
        for (const row of rows) {
            assert.ok(row["RELATION_TYPE"] === "IMPORT" || row["RELATION_TYPE"] === "EXPORT");
            assert.equal(row["MODULE_NAME"], "InformationFramework");
            assert.ok(/[0-9\.]+/.test(row["MODULE_OID"]));
            assert.ok(row["MODULE_IRI"].length === 0 || row["MODULE_IRI"].startsWith("/"));
            assert.ok(/[A-Za-z0-9\-\{\}]+/.test(row["SYMBOL_NAME"]));
            assert.ok(row["USED_PARAM_BRACKETS"] === "TRUE" || row["USED_PARAM_BRACKETS"] === "FALSE");
            assert.ok(/[A-Z][A-Za-z0-9\-]*/.test(row["FROM_MODULE_NAME"]));
            assert.ok(/[0-9\.]*/.test(row["FROM_MODULE_OID"]));
            assert.equal(row["FROM_MODULE_IRI"].charAt(0) || "/", "/");
            assert.ok(["", "WITH_SUCCESSORS", "WITH_DESCENDANTS"].includes(row["FROM_MODULE_SEL_OPT"]));
        }
    });

    test('Export All ASN.1 Modules in Current File to CSV', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const InformationFrameworkUri = vscode.Uri.joinPath(workspaceFolder.uri, "InformationFramework.asn1");
        const InformationFramework = await vscode.workspace.openTextDocument(InformationFrameworkUri);
        await vscode.window.showTextDocument(InformationFramework);
        await vscode.commands.executeCommand("asn1.mods-to-csv.opendoc");
        const csvdoc = vscode.window.activeTextEditor?.document;
        assert.ok(csvdoc);
        const csvText = csvdoc.getText();
        const rows = parseCSV(csvText, {
            skipFirstRow: true,
            columns: MODS_CSV_HEADERS,
        });
        assert.ok(rows.length > 0);
        for (const row of rows) {
            assert.equal(row["MODULE_NAME"], "InformationFramework");
            assert.ok(/[0-9\.]+/.test(row["MODULE_OID"]));
            assert.ok(row["MODULE_IRI"].length === 0 || row["MODULE_IRI"].startsWith("/"));
            assert.ok(["EXPLICIT", "IMPLICIT", "AUTOMATIC"].includes(row["TAGGING_MODE"]));
            assert.ok(["TRUE", "FALSE"].includes(row["EXTENS_IMPLIED"]));
            assert.ok(["TRUE", "FALSE"].includes(row["EXPORTS_ALL"]));
            assert.equal(row["ENCODING_REF"], "");
            assert.ok(/\d+/.test(row["ASSIGNMENTS_COUNT"]));
            assert.ok(/\d+/.test(row["IMPORTED_MODS_COUNT"]));
            assert.ok(/\d+/.test(row["IMPORTED_SYMS_COUNT"]));
        }
    });

    test('Export All ASN.1 Assignments in Current File to CSV', async () => {
        const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
        const outcome = await ext.activate();
        await outcome.indexingPromise;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(workspaceFolder);
        const InformationFrameworkUri = vscode.Uri.joinPath(workspaceFolder.uri, "InformationFramework.asn1");
        const InformationFramework = await vscode.workspace.openTextDocument(InformationFrameworkUri);
        await vscode.window.showTextDocument(InformationFramework);
        await vscode.commands.executeCommand("asn1.assns-to-csv.opendoc");
        const csvdoc = vscode.window.activeTextEditor?.document;
        assert.ok(csvdoc);
        const csvText = csvdoc.getText();
        const rows = parseCSV(csvText, {
            skipFirstRow: true,
            columns: ASSNS_CSV_HEADERS,
        });
        assert.ok(rows.length > 0);
        for (const row of rows) {
            assert.equal(row["MODULE_NAME"], "InformationFramework");
            assert.ok(/[0-9\.]+/.test(row["MODULE_OID"]));
            assert.ok(row["MODULE_IRI"].length === 0 || row["MODULE_IRI"].startsWith("/"));
            assert.ok(/[A-Za-z0-9\-]*/.test(row["ASSIGNMENT_NAME"]));
            assert.ok(row["ASSIGNMENT_TYPE"].endsWith("Assignment"));
            assert.ok(row["TYPE_TYPE"] === "" || row["TYPE_TYPE"].endsWith("Type"));
            assert.ok(row["VALUE_TYPE"] === "" || row["VALUE_TYPE"].endsWith("Value"));
            assert.ok(/\d+/.test(row["PARAMETERS_COUNT"]));
            assert.ok(/\d*/.test(row["ASSIGNMENT_INDEX"]));
            assert.ok(/\d*/.test(row["DEPENDENCY_INDEX"]));
            assert.ok(/[A-Z0-9\-]*/.test(row["INFO_OBJECT_CLASS"]));
        }
    });
});
