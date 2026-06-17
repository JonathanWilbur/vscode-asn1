import * as vscode from 'vscode';
import {
	type Module,
	TaggingMode,
	Production,
	Assignment,
	AssignmentType,
} from '@wildboar/asn1-parser';
import { getParserOutputs } from "./parsing.js";
import { getRangeFromLocation } from "./utils.js";
import { getOidNodesFromModuleIdentifier } from "./utils.js";

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

function getSymbolInfoFromAssignment(ass: Assignment): string {
	switch (ass.assignmentType) {
		case (AssignmentType.ObjectAssignment):
		case (AssignmentType.ParameterizedObjectAssignment):
			return ass.definedObjectClass.reference;
		case (AssignmentType.ObjectSetAssignment):
		case (AssignmentType.ParameterizedObjectSetAssignment):
			return ass.definedObjectClass.reference;
		default: return "";
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
		getSymbolInfoFromAssignment(ass),
		getSymbolKindFromAssignment(ass.assignmentType),
		assrange, // full symbol range
		nameRange ?? assrange, // name/selection range
	);
}

async function provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<vscode.DocumentSymbol[]> {
    const p = await getParserOutputs(document.uri, undefined, token);
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
		if (token.isCancellationRequested) {
			break;
		}
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
		for (const sfm of Object.values(module.imports.modules)) {
			if (!sfm.production) {
				continue;
			}
			const range = getRangeFromLocation(document, sfm.production.location);
			symbol.children.push(new vscode.DocumentSymbol(
				sfm.identifier,
				"",
				vscode.SymbolKind.Package,
				range,
				range,
			));
		}
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

export class Asn1SymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.DocumentSymbol[]> {
        return provideDocumentSymbols(document, token);
	}
}
