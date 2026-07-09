import * as vscode from 'vscode';
import { ASN1HoverProvider } from "./hover.js";
import { Asn1DefinitionProvider } from './gotodef.js';
import { Asn1SymbolProvider } from "./symbols.js";
import { Asn1ReferenceProvider } from "./findallref.js";
import { Asn1RenameProvider } from "./rename.js";
import { Asn1HighlightProvider } from "./highlight.js";
import { Asn1FoldingRangeProvider } from "./folding.js";
import { Asn1CodeActionProvider } from "./codeact.js";
import { Asn1CompletionItemProvider } from "./completion.js";
import { indexAsn1Files, indexAsn1File, reindexAsn1File, deindexAsn1File, clearAsn1ModuleIndexes } from "./indexing.js";
import { log } from "./logging.js";
import {
	updateDiagnostics,
	diagnosticCollection,
} from "./diagnostics.js";
import { Asn1DocumentFormattingEditProvider } from './format.js';
import { Asn1InlineCompletionItemProvider } from './inccomp.js';
import { Asn1SelectionRangeProvider } from './selectrange.js';
import { Asn1SignatureHelpProvider } from './sighelp.js';
import { Asn1TypeDefinitionProvider } from './typedef.js';
import { Asn1WorkspaceSymbolProvider } from './wssymbols.js';
import {
	export_deps_csv_from_doc_cmd,
	export_deps_csv_from_workspace_cmd,
	export_oid_csv_from_doc_cmd,
	export_oid_csv_from_workspace_cmd,
	export_modules_csv_from_doc_cmd,
	export_modules_csv_from_workspace_cmd,
	export_assignments_csv_from_doc_cmd,
	export_assignments_csv_from_workspace_cmd,
	export_modules_json_from_doc_cmd,
} from "./commands.js";
import { clearParserOutputCaches, get_last_parsed_doc_version_cmd } from './parsing.js';

const LANGUAGE: string = "asn1";

// See: https://github.com/Microsoft/vscode/issues/42649
vscode.languages.setLanguageConfiguration(LANGUAGE, {
    wordPattern: /\b[A-Za-z][A-Za-z0-9\-]*[A-Za-z0-9]\b/
});

const ASN1_MODE: vscode.DocumentFilter[] = [
    { language: LANGUAGE, scheme: "file" },
    { language: LANGUAGE, scheme: "untitled" },
];

function isAsn1File(doc: vscode.TextDocument) {
	return (doc.languageId === LANGUAGE);
}

export function activate(context: vscode.ExtensionContext) {

	const isExtensionDevelopment = (context.extensionMode === vscode.ExtensionMode.Development);
	if (isExtensionDevelopment) {
		vscode.window.showInformationMessage(
			"When you have the output pane open, you code highlights vanish "
			+ "immediately. This is a quirk you should know about. "
			+ "This message will not appear if this extension is not in "
			+ "development. End users of this extension will not see this."
		);
	}

	const commandDiagnose = vscode.commands.registerCommand("asn1.diagnose", async (uri?: vscode.Uri) => {
		const activeDoc = vscode.window.activeTextEditor?.document;
		const activeUri = uri ?? activeDoc?.uri;
		if (!activeUri) {
			vscode.window.showErrorMessage("No document open. This command requires an open ASN.1 file.");
			return;
		}
		const doc = await vscode.workspace.openTextDocument(activeUri);
    	await updateDiagnostics(doc, diagnosticCollection);
	});
	context.subscriptions.push(commandDiagnose);

	vscode.commands.registerCommand("asn1.oid-to-csv.opendoc", export_oid_csv_from_doc_cmd);
	vscode.commands.registerCommand("asn1.oid-to-csv.workspace", export_oid_csv_from_workspace_cmd);
	vscode.commands.registerCommand("asn1.deps-to-csv.opendoc", export_deps_csv_from_doc_cmd);
	vscode.commands.registerCommand("asn1.deps-to-csv.workspace", export_deps_csv_from_workspace_cmd);
	vscode.commands.registerCommand("asn1.mods-to-csv.opendoc", export_modules_csv_from_doc_cmd);
	vscode.commands.registerCommand("asn1.mods-to-csv.workspace", export_modules_csv_from_workspace_cmd);
	vscode.commands.registerCommand("asn1.assns-to-csv.opendoc", export_assignments_csv_from_doc_cmd);
	vscode.commands.registerCommand("asn1.assns-to-csv.workspace", export_assignments_csv_from_workspace_cmd);
	// There is no workspace equivalent for this command because it creates a
	// gigantic output just for just one file. I'm not sure my computer, or
	// anybody's computer, even has enough memory to test it.
	vscode.commands.registerCommand("asn1.mods-to-json.opendoc", export_modules_json_from_doc_cmd);
	// vscode.commands.registerCommand("asn1.x500-to-json.opendoc", export_x500_schema_json_from_doc_cmd);

	// Internal only. Not exposed to users. Created so unit tests can poll until parsing is complete.
	vscode.commands.registerCommand("asn1.parsed-version", get_last_parsed_doc_version_cmd);

	context.subscriptions.push(
		vscode.languages.registerDocumentSymbolProvider(ASN1_MODE, new Asn1SymbolProvider()));
	context.subscriptions.push(
        vscode.languages.registerHoverProvider(ASN1_MODE, new ASN1HoverProvider()));
	context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(ASN1_MODE, new Asn1DefinitionProvider()));
	context.subscriptions.push(
		vscode.languages.registerReferenceProvider(ASN1_MODE, new Asn1ReferenceProvider()));
	context.subscriptions.push(
		vscode.languages.registerRenameProvider(ASN1_MODE, new Asn1RenameProvider()));
	context.subscriptions.push(
		vscode.languages.registerFoldingRangeProvider(ASN1_MODE, new Asn1FoldingRangeProvider()));
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(ASN1_MODE, new Asn1CodeActionProvider()));
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
			ASN1_MODE,
			new Asn1CompletionItemProvider(),
			".",
			"&",
			"{",
			" ",
			"\t",
			"|",
			",",
			"[",
		),
	);
	context.subscriptions.push(
		vscode.languages.registerDocumentFormattingEditProvider(ASN1_MODE, new Asn1DocumentFormattingEditProvider()));
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(ASN1_MODE, new Asn1InlineCompletionItemProvider()));
	context.subscriptions.push(
		vscode.languages.registerSelectionRangeProvider(ASN1_MODE, new Asn1SelectionRangeProvider()));
	context.subscriptions.push(
		vscode.languages.registerSignatureHelpProvider(ASN1_MODE, new Asn1SignatureHelpProvider(), "{", ","));
	context.subscriptions.push(
		vscode.languages.registerTypeDefinitionProvider(ASN1_MODE, new Asn1TypeDefinitionProvider()));
	context.subscriptions.push(
		vscode.languages.registerWorkspaceSymbolProvider(new Asn1WorkspaceSymbolProvider()));
	context.subscriptions.push(
        vscode.languages.registerDocumentHighlightProvider(ASN1_MODE, new Asn1HighlightProvider()));
	context.subscriptions.push(diagnosticCollection);

	// APIs evaluated, but decided against:
	// vscode.languages.registerCodeLensProvider: no use case
	// vscode.languages.registerColorProvider: no use case
	// vscode.languages.registerDeclarationProvider: no use case
	// vscode.languages.registerDocumentDropEditProvider: no use case
	// vscode.languages.registerDocumentLinkProvider: not really sure what this is and probably not useful anyway
	// vscode.languages.registerDocumentPasteEditProvider: no use case
	// vscode.languages.registerDocumentRangeFormattingEditProvider: maybe one day, but pretty low value and high difficulty
	// vscode.languages.registerDocumentRangeSemanticTokensProvider: computationally expensive but low value
	// vscode.languages.registerInlayHintsProvider: one of VS Code's most annoying features, computationally expensive, low value, no use case
	// vscode.languages.registerDocumentSemanticTokensProvider: computationally expensive but low value
	// vscode.languages.registerLinkedEditingRangeProvider: I'll consider this one later. It seems like it could be an annoying source of unexpected behavior.
	// vscode.languages.registerOnTypeFormattingEditProvider: computationally expensive, annoying, overly opinionated, etc.
	// vscode.languages.registerTypeHierarchyProvider: could be useful for X.500 object classes, but otherwise narrow use case

	// FIXME: Make the watcher use the configured extensions.
	/* We have to do the most minimal indexing so we know what files have what
	modules and what modules are in what files. This might not even really be
	necessary, but I need to experiment to see if it is terribly slow or not. */
	const watcher = vscode.workspace.createFileSystemWatcher("**/*.{asn,asn1}");
	watcher.onDidCreate((uri) => indexAsn1File(uri).catch((e) => log.appendLine(e.toString())));
	watcher.onDidChange((uri) => reindexAsn1File(uri).catch((e) => log.appendLine(e.toString())));
	watcher.onDidDelete((uri) => deindexAsn1File(uri));
	context.subscriptions.push(watcher);

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (!editor) {
			return;
		}
		const document = editor.document;
		if (!isAsn1File(document)) {
			return;
		}
		// This document is now the active tab.
		// We don't want to update diagnostics just because the user switch tabs.
		// This should only run if they switched tabs AND the diagnostics were
		// never taken before.
		if (!diagnosticCollection.has(document.uri)) {
			updateDiagnostics(document, diagnosticCollection);
		}
	});
	/* Only untitled ASN.1 files get indexed upon opening. */
	vscode.workspace.onDidOpenTextDocument((document) => {
		if (document.isUntitled && isAsn1File(document)) {
			reindexAsn1File(document.uri).catch(() => {});
		}
	});
	vscode.workspace.onDidCloseTextDocument((document) => {
		if (document.isUntitled && isAsn1File(document)) {
			deindexAsn1File(document.uri);
		}
	});
	vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (!isAsn1File(document)) {
			return;
		}
		await reindexAsn1File(document.uri);
		await updateDiagnostics(document, diagnosticCollection);
	});

	// Update diagnostics for the open editor.
	const editor = vscode.window.activeTextEditor;
	const activeDocument = editor?.document;
	if (activeDocument && isAsn1File(activeDocument)) {
		indexAsn1File(activeDocument)
			.then(() => updateDiagnostics(activeDocument, diagnosticCollection))
			.catch(() => {})
			;
	}

	log.appendLine(`${new Date()}: asn.1 providers initialized / starting indexing of files`);
    return {
        indexingPromise: indexAsn1Files()
			.catch((e) => log.appendLine(e.toString())),
    };
}

export function deactivate() {
	clearAsn1ModuleIndexes();
	clearParserOutputCaches();
}
