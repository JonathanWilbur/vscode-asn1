// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { lex, parse, grok, correct, type Module, TaggingMode, Production, Assignment, Location, AssignmentType } from '@wildboar/asn1-parser';

const LANGUAGE: string = "asn1";

function getRangeFromLocation(
	document: vscode.TextDocument,
	loc: Location,
): vscode.Range {
	const start = document.positionAt(loc.startIndex);
	const end = document.positionAt(loc.endIndex);
	return new vscode.Range(start, end);
}

function getDocumentSymbolDetailsFromAsn1Module(mod: Module): string {
	const details: string[] = [];
	if (mod.oid) {
		// FIXME: This OID is not displaying correctly.
		details.push(`oid:${mod.oid}`);
	}
	if (mod.iri) {
		const iri = mod.iri.replaceAll(/\s+/, "");
		// TODO: More validation?
		details.push(`iri:${iri}`);
	}
	if (mod.extensibilityImplied) {
		details.push("extensibility-implied");
	}
	if (mod.exports) { // TODO: Does `undefined` mean EXPORTS ALL?

	}
	if (mod.taggingMode === TaggingMode.EXPLICIT) {
		details.push("explicit-tagging");
	} else if (mod.taggingMode === TaggingMode.IMPLICIT) {
		details.push("implicit-tagging");
	} else if (mod.taggingMode === TaggingMode.AUTOMATIC) {
		details.push("automatic-tagging");
	}
	return details.join(" ");
}

function getModuleNameRangeFromModuleProduction(
	prod: Production,
	document: vscode.TextDocument,
): vscode.Range | null {
	let curr = prod.children[0];
	while (curr && curr.type !== 'modulereference') {
		curr = curr.children[0];
	}
	if (curr.type !== 'modulereference') {
		return null;
	}
	return getRangeFromLocation(document, curr.location);
}

function getSymbolKindFromAssignment(ass: AssignmentType): vscode.SymbolKind {
	// TODO: Convert this to a Map for performance.
	switch (ass) {
		case (AssignmentType.ValueAssignment):
		case (AssignmentType.ParameterizedValueAssignment):
		case (AssignmentType.XMLValueAssignment):
			return vscode.SymbolKind.Constant;
		case (AssignmentType.TypeAssignment):
		case (AssignmentType.ParameterizedTypeAssignment):
			return vscode.SymbolKind.Struct;
		case (AssignmentType.ObjectAssignment):
		case (AssignmentType.ParameterizedObjectAssignment):
			return vscode.SymbolKind.Object;
		case (AssignmentType.ObjectClassAssignment):
		case (AssignmentType.ParameterizedObjectClassAssignment):
			return vscode.SymbolKind.Class;
		case (AssignmentType.ObjectSetAssignment):
		case (AssignmentType.ParameterizedObjectSetAssignment):
			return vscode.SymbolKind.Array;
		case (AssignmentType.ValueSetTypeAssignment):
		case (AssignmentType.ParameterizedValueSetTypeAssignment):
			return vscode.SymbolKind.Array;
		default:
			return vscode.SymbolKind.Null;		
	}
}

function getDocumentSymbolFromAssignment(
	document: vscode.TextDocument,
	name: string,
	ass: Assignment,
): vscode.DocumentSymbol | null {
	if (!ass.production) {
		return null;
	}
	const assloc = ass.production.location;
	const assrange = getRangeFromLocation(document, assloc);
	const nameRange = assrange; // FIXME: Actually find the identifier.
	return new vscode.DocumentSymbol(
		name,
		"", // TODO: Populate with properties
		getSymbolKindFromAssignment(ass.assignmentType),
		assrange, // full symbol range
		nameRange ?? assrange, // name/selection range
	);
}

class Asn1SymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const text = document.getText();
	const lexResults = Array.from(lex(text));
	const parseResults = parse(text, lexResults);
	const modules = grok(text, parseResults);
	correct(modules);

	// FIXME: ProductionType doesn't seem to be exported correctly.
	try {
		const parseModules = parseResults.cst.children
			.find((c) => c.type === 'modules')
			?.children.filter((c) => c.type === 'ModuleDefinition')
			?? [];
		if (modules.length !== parseModules.length) {
			console.log('hi');
			return [];
		}

		const symbols: vscode.DocumentSymbol[] = [];
		for (const [i, module] of modules.entries()) {
			const moduleProduction = parseModules[i];
			const start = document.positionAt(moduleProduction.location.startIndex);
			const end = document.positionAt(moduleProduction.location.endIndex);
			const nameRange = getModuleNameRangeFromModuleProduction(moduleProduction, document);
			const moduleRange = new vscode.Range(start, end);
			const symbol = new vscode.DocumentSymbol(
				module.name,
				getDocumentSymbolDetailsFromAsn1Module(module),
				vscode.SymbolKind.Module,
				moduleRange, // full symbol range
				nameRange ?? moduleRange, // name/selection range
			);
			symbols.push(symbol);
			for (const [assname, ass] of Object.entries(module.assignments)) {
				const asym = getDocumentSymbolFromAssignment(document, assname, ass);
				// FIXME: This isn't working because the assignment never has an associated production.
				if (asym) {
					symbol.children.push(asym);
				}
			}
		}
		return symbols;
	} catch (e) {
		console.error(e);
		return [];
	}
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "asn1" is now active!');

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
		vscode.languages.registerDocumentSymbolProvider(
			{ language: LANGUAGE },
			new Asn1SymbolProvider()
		)
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
