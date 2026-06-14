import * as vscode from 'vscode';
import { ASN1HoverProvider } from "./hover.js";
import { Asn1DefinitionProvider } from './gotodef.js';
import { Asn1SymbolProvider } from "./symbols.js";
import { Asn1ReferenceProvider } from "./findallref.js";
import { Asn1RenameProvider } from "./rename.js";
import { Asn1HighlightProvider } from "./highlight.js";
import { indexAsn1Files, indexAsn1File, reindexAsn1File } from "./indexing.js";
import { log } from "./logging.js";
import { updateDiagnostics } from "./diagnostics.js";

const LANGUAGE: string = "asn1";

// See: https://github.com/Microsoft/vscode/issues/42649
vscode.languages.setLanguageConfiguration(LANGUAGE, {
    wordPattern: /\b[A-Za-z][A-Za-z0-9\-]*[A-Za-z0-9]\b/
});

const ASN1_MODE: vscode.DocumentFilter = { language: LANGUAGE, scheme: 'file' };

function isAsn1File(doc: vscode.TextDocument) {
	return (
		doc.languageId === LANGUAGE
		&& doc.uri.scheme === "file"
	);
}

let diagnosticCollection: vscode.DiagnosticCollection;

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

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('asn1.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from ASN.1!');
	});

	context.subscriptions.push(disposable);

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
        vscode.languages.registerDocumentHighlightProvider(ASN1_MODE, new Asn1HighlightProvider()));
	diagnosticCollection = vscode.languages.createDiagnosticCollection(LANGUAGE);
	context.subscriptions.push(diagnosticCollection);

	/* We have to do the most minimal indexing so we know what files have what
	modules and what modules are in what files. This might not even really be
	necessary, but I need to experiment to see if it is terribly slow or not. */
	const watcher = vscode.workspace.createFileSystemWatcher("**/*.{asn,asn1}");
	watcher.onDidCreate((uri) => indexAsn1File(uri).catch((e) => log.appendLine(e.toString())));
	watcher.onDidChange((uri) => reindexAsn1File(uri).catch((e) => log.appendLine(e.toString())));
	// TODO:
	// watcher.onDidDelete((uri) => {
	// 	symbolIndex.delete(uri.toString());
	// });
	// vscode.workspace.onDidOpenTextDocument((e) => {
	// 	if (!isAsn1File(e)) {
	// 		return;
	// 	}
	// 	updateDiagnostics(e, diagnosticCollection);
	// });
	vscode.workspace.onDidChangeTextDocument((e) => {
		if (!isAsn1File(e.document)) {
			return;
		}
		updateDiagnostics(e.document, diagnosticCollection);
	});
	context.subscriptions.push(watcher);
	log.appendLine(`${new Date()}: asn.1 providers initialized / starting indexing of files`);
	indexAsn1Files()
		.catch((e) => log.appendLine(e.toString()));
}

export function deactivate() {}
