// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {
	lex,
	parse,
	grok,
	correct,
	type Module,
	TaggingMode,
	Production,
	Assignment,
	type Location,
	AssignmentType,
	type NameAndOrNumber,
} from '@wildboar/asn1-parser';
import { ASN1HoverProvider } from "./hover.js";
import { getParserOutputs } from "./parsing.js";
import { Asn1DefinitionProvider } from './gotodef.js';

const LANGUAGE: string = "asn1";

function getRangeFromLocation(
	document: vscode.TextDocument,
	loc: Location,
): vscode.Range {
	const start = document.positionAt(loc.startIndex);
	const end = document.positionAt(loc.endIndex);
	return new vscode.Range(start, end);
}

const builtinRootArcNamesToNumber: Map<string, number> = new Map([
	["itu-t", 0],
	["ccitt", 0],
	["iso", 1],
	["joint-iso-itu-t", 2],
	["joint-iso-ccitt", 2],
]);

function getOidNodesFromModuleIdentifier(mid: NameAndOrNumber[]): number[] | null {
	if (!(mid.slice(1).every((m) => "number" in m))) {
		return null;
	}
	const first = mid[0];
	if ("number" in first) {
		return mid.map((m) => ("number" in m) ? m.number : -1);
	} else if ("name" in first) {
		const num = builtinRootArcNamesToNumber.get(first.name);
		if (typeof num === "undefined") {
			return null;
		}
		return [
			num,
			...mid.map((m) => ("number" in m) ? m.number : -1),
		];
	}
	return null;
}

function getDocumentSymbolDetailsFromAsn1Module(mod: Module): string {
	const details: string[] = [];
	if (mod.oid) {
		const oid = getOidNodesFromModuleIdentifier(mod.oid);
		oid && details.push(`oid:${oid.join(".")}`);
	}
	if (mod.extensibilityImplied) {
		details.push("ext-imp");
	}
	if (mod.taggingMode === TaggingMode.EXPLICIT) {
		details.push("exp");
	} else if (mod.taggingMode === TaggingMode.IMPLICIT) {
		details.push("imp");
	} else if (mod.taggingMode === TaggingMode.AUTOMATIC) {
		details.push("auto");
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
		const p = getParserOutputs(document);
		if (
			!p.parserEndState
			|| ("err" in p.parserEndState)
			|| p.parserEndState.ok.error
			|| (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
			|| !p.parsedModules
			|| ("err" in p.parsedModules)
		) {
			return [];
		}
		const modules = p.parsedModules.ok;
		const cst = p.parserEndState.ok.cst;
		const parseModules = cst.children
			.find((c) => c.type === 'modules')
			?.children.filter((c) => c.type === 'ModuleDefinition')
			?? [];
		if (modules.length !== parseModules.length) {
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
	}
}

// See: https://github.com/Microsoft/vscode/issues/42649
vscode.languages.setLanguageConfiguration(LANGUAGE, {
    wordPattern: /\b[A-Za-z][A-Za-z0-9\-]*[A-Za-z0-9]\b/
});

const ASN1_MODE: vscode.DocumentFilter = { language: LANGUAGE, scheme: 'file' };

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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

	context.subscriptions.push(
        vscode.languages.registerHoverProvider(ASN1_MODE, new ASN1HoverProvider()));

	context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            ASN1_MODE, new Asn1DefinitionProvider()));
}

// This method is called when your extension is deactivated
export function deactivate() {}
